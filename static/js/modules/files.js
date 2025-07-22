export async function initializeFiles() {
    // Инициализация обработчиков для работы с файлами
    document.addEventListener('DOMContentLoaded', () => {
        setupFileEventListeners();
    });
}

// Настройка обработчиков событий для файлов
function setupFileEventListeners() {
    // Загрузка файлов
    document.getElementById('uploadFileBtn')?.addEventListener('click', uploadFiles);
    document.getElementById('taskFileInput')?.addEventListener('change', handleFileInputChange);
    
    // Drag and drop для файлов
    const dropZone = document.getElementById('fileDropZone');
    if (dropZone) {
        dropZone.addEventListener('dragover', handleDragOver);
        dropZone.addEventListener('dragleave', handleDragLeave);
        dropZone.addEventListener('drop', handleDrop);
    }
}

// Обновление списка файлов задачи
export async function updateTaskFilesList(taskId) {
    try {
        const response = await fetch(`/api/tasks/${taskId}/files`);
        if (!response.ok) throw new Error('Ошибка получения файлов');

        const files = await response.json();
        console.log('Полученные файлы для задачи', taskId, ':', files);
        renderFilesList(files, taskId);
    } catch (error) {
        console.error('Ошибка при получении файлов:', error);
        renderFilesError();
    }
}

// Отрисовка списка файлов
function renderFilesList(files, taskId) {
    const filesList = document.getElementById('editTaskFiles');
    if (!filesList) {
        console.warn('Элемент editTaskFiles не найден');
        return;
    }

    filesList.innerHTML = files.map(file => `
        <div class="file-item" data-fileid="${file.id}">
            <div class="file-info">
                <a href="/api/tasks/${taskId}/files/${file.id}" 
                   target="_blank" 
                   class="file-link">
                    <span class="file-icon">${getFileIcon(file.name)}</span>
                    <span class="file-name">${file.name}</span>
                </a>
                <span class="file-size">${formatFileSize(file.size)}</span>
            </div>
            <button class="delete-file" data-fileid="${file.id}">
                ✕
            </button>
        </div>
    `).join('');

    // Настройка обработчиков для кнопок удаления
    document.querySelectorAll('.delete-file').forEach(btn => {
        btn.addEventListener('click', (e) => deleteFile(e, taskId));
    });
}

// Отрисовка ошибки загрузки файлов
function renderFilesError() {
    const filesList = document.getElementById('editTaskFiles');
    if (filesList) {
        filesList.innerHTML = '<div class="file-error">Не удалось загрузить список файлов</div>';
    }
}

// Загрузка файлов
async function uploadFiles() {
    if (!window.currentEditId) return;

    const fileInput = document.getElementById('taskFileInput');
    if (!fileInput.files.length) {
        alert('Выберите файлы для загрузки');
        return;
    }

    const formData = new FormData();
    for (let i = 0; i < fileInput.files.length; i++) {
        formData.append('files', fileInput.files[i]);
    }

    try {
        const response = await fetch(`/api/tasks/${window.currentEditId}/files`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) throw new Error('Ошибка загрузки файлов');

        fileInput.value = '';
        await updateTaskFilesList(window.currentEditId);
    } catch (error) {
        console.error('Ошибка при загрузке файлов:', error);
        alert('Не удалось загрузить файлы');
    }
}

// Удаление файла
async function deleteFile(event, taskId) {
    const fileId = event.target.dataset.fileid;
    if (!confirm('Вы уверены, что хотите удалить этот файл?')) return;

    try {
        const response = await fetch(`/api/tasks/${taskId}/files/${fileId}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Ошибка удаления файла');

        await updateTaskFilesList(taskId);
    } catch (error) {
        console.error('Ошибка при удалении файла:', error);
        alert('Не удалось удалить файл');
    }
}

// Обработка изменения поля выбора файлов
function handleFileInputChange(e) {
    const files = e.target.files;
    const fileInfo = document.getElementById('fileInfo');
    
    if (!files.length) {
        fileInfo.textContent = '';
        return;
    }

    const names = Array.from(files).map(f => f.name).join(', ');
    fileInfo.textContent = `Выбрано файлов: ${files.length} (${names})`;
}

// Обработка drag and drop
function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    e.target.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    e.target.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    e.target.classList.remove('drag-over');

    const files = e.dataTransfer.files;
    if (!files.length) return;

    const fileInput = document.getElementById('taskFileInput');
    fileInput.files = files;
    handleFileInputChange({ target: fileInput });
}

// Вспомогательные функции

function getFileIcon(filename) {
    const extension = filename.split('.').pop().toLowerCase();
    const icons = {
        pdf: '📄',
        doc: '📝',
        docx: '📝',
        xls: '📊',
        xlsx: '📊',
        ppt: '📑',
        pptx: '📑',
        jpg: '🖼️',
        jpeg: '🖼️',
        png: '🖼️',
        gif: '🖼️',
        txt: '📋',
        zip: '🗄️',
        rar: '🗄️',
        mp3: '🎵',
        mp4: '🎬'
    };
    return icons[extension] || '📁';
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Экспортируем функцию для использования в других модулях
export async function handleTaskFiles(taskId) {
    return updateTaskFilesList(taskId);
}