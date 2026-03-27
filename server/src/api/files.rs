use axum::{
    body::Body,
    extract::{Multipart, Path, State},
    http::header,
    response::Response,
    Json,
};
use shared::AttachmentDto;
use uuid::Uuid;

use crate::{api::AuthUser, error::AppError, state::AppState};

const MAX_FILE_SIZE: usize = 25 * 1024 * 1024; // 25MB

/// POST /api/upload
pub async fn upload(
    State(state): State<AppState>,
    auth: AuthUser,
    mut multipart: Multipart,
) -> Result<Json<AttachmentDto>, AppError> {
    while let Some(field) = multipart.next_field().await? {
        if field.name() != Some("file") {
            continue;
        }

        let filename = field.file_name().unwrap_or("file").to_string();
        let mime = field
            .content_type()
            .unwrap_or("application/octet-stream")
            .to_string();
        let data = field.bytes().await?;

        if data.len() > MAX_FILE_SIZE {
            return Err(AppError::BadRequest(
                "файл слишком большой (макс 25MB)".into(),
            ));
        }

        if data.is_empty() {
            return Err(AppError::BadRequest("пустой файл".into()));
        }

        let att_id = Uuid::new_v4();
        let path = format!("{}/{}", state.config.upload_dir, att_id);

        tokio::fs::write(&path, &data)
            .await
            .map_err(|e| AppError::Internal(format!("write file: {e}")))?;

        let size = data.len() as i64;

        sqlx::query(
            "INSERT INTO attachments (id, uploader_id, filename, mime_type, size_bytes)
             VALUES ($1, $2, $3, $4, $5)",
        )
        .bind(att_id)
        .bind(auth.user_id)
        .bind(&filename)
        .bind(&mime)
        .bind(size)
        .execute(&state.db)
        .await?;

        tracing::info!(%att_id, %filename, size, "file uploaded");

        return Ok(Json(AttachmentDto {
            id: att_id,
            filename,
            mime_type: mime,
            size_bytes: size,
        }));
    }

    Err(AppError::BadRequest("no file in request".into()))
}

/// GET /api/files/:file_id — без авторизации (UUID = capability token)
pub async fn download(
    State(state): State<AppState>,
    Path(file_id): Path<Uuid>,
) -> Result<Response, AppError> {
    let row: Option<(String, i64)> =
        sqlx::query_as("SELECT mime_type, size_bytes FROM attachments WHERE id = $1")
            .bind(file_id)
            .fetch_optional(&state.db)
            .await?;

    let (mime, size) = row.ok_or_else(|| AppError::NotFound("file not found".into()))?;

    let path = format!("{}/{}", state.config.upload_dir, file_id);
    let data = tokio::fs::read(&path)
        .await
        .map_err(|e| AppError::NotFound(format!("file missing: {e}")))?;

    Response::builder()
        .header(header::CONTENT_TYPE, mime)
        .header(header::CONTENT_LENGTH, size)
        .header(header::CACHE_CONTROL, "max-age=31536000, immutable")
        .body(Body::from(data))
        .map_err(|e| AppError::Internal(format!("response: {e}")))
}
