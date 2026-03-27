#!/bin/bash

# Имя итогового файла
OUTPUT_FILE="all_project_code.txt"

# Очищаем файл, если он уже существует
> "$OUTPUT_FILE"

echo "Начинаю сбор файлов..."

# Используем команду find для поиска нужных файлов.
# Строка с -prune исключает папки node_modules, target, .git из поиска, чтобы скрипт не завис.
find . \
  -type d \( -name "node_modules" -o -name "target" -o -name ".git" -o -name "dist" -o -name "build" \) -prune \
  -o \
  -type f \( \
    -name "*.ts" -o \
    -name "*.tsx" -o \
    -name "*.rs" -o \
    -name "*.sql" -o \
    -name "*.css" -o \
    -name "Cargo.toml" -o \
    -name "vite.config.ts" \
  \) -print | sort | while IFS= read -r file; do
    
    # Выводим информацию в консоль для наглядности
    echo "Добавляю: $file"
    
    # Записываем красивый разделитель и путь к файлу в итоговый текстовый документ
    echo "================================================================================" >> "$OUTPUT_FILE"
    echo "FILE PATH: $file" >> "$OUTPUT_FILE"
    echo "================================================================================" >> "$OUTPUT_FILE"
    
    # Добавляем содержимое файла
    cat "$file" >> "$OUTPUT_FILE"
    
    # Добавляем пару пустых строк после файла для читаемости
    echo -e "\n\n" >> "$OUTPUT_FILE"

done

echo "Готово! Весь код собран в файл: $OUTPUT_FILE"