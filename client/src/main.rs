mod app;
mod state;

fn main() {
    let options = eframe::NativeOptions::default();
    let _ = eframe::run_native(
        "Messenger",
        options,
        Box::new(|_cc| Box::new(app::MessengerApp::new())),
    );
}
