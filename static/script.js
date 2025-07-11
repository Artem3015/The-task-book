// Инициализация Web Speech API
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'ru-RU';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    console.log('SpeechRecognition initialized');
} else {
    console.log('SpeechRecognition not supported');
}

let currentCategory = null;
let showArchive = false;
let currentEditId = null;
let categories = [];
let tasks = [];

async function fetchData() {
    try {
        const response = await fetch('/api/tasks');
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        const data = await response.json();
        tasks = data.tasks || [];
        console.log('Fetched tasks from API:', tasks);
        return data;
    } catch (error) {
        console.error('Ошибка загрузки задач:', error);
        alert('Не удалось загрузить задачи. Проверьте подключение к серверу.');
        return { tasks: [], archived_tasks: [] };
    }
}

async function fetchCategories() {
    try {
        const response = await fetch('/api/categories');
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        categories = await response.json();
        return categories;
    } catch (error) {
        console.error('Ошибка загрузки категорий:', error);
        alert('Не удалось загрузить категории. Проверьте подключение к серверу.');
        return [];
    }
}

async function renderCategories() {
    await fetchCategories();
    const categoryList = document.getElementById('categoryList');
    if (!categoryList) {
        console.error('Element #categoryList not found');
        return;
    }
    categoryList.innerHTML = categories.map(category => `
        <li draggable="true" class="p-2 bg-gray-200 rounded-lg cursor-pointer hover:bg-gray-300 flex justify-between items-center ${currentCategory === category ? 'bg-blue-200' : ''}" data-category="${category}">
            <span>${category}</span>
            <button class="delete-category text-red-500 hover:text-red-700" data-category="${category}">✕</button>
        </li>
    `).join('');

    document.querySelectorAll('#categoryList li').forEach(li => {
        li.addEventListener('click', (e) => {
            if (!e.target.closest('.delete-category')) {
                currentCategory = li.dataset.category;
                renderTasks();
            }
        });
        li.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', li.dataset.category);
            e.target.classList.add('opacity-50');
        });
        li.addEventListener('dragend', (e) => {
            e.target.classList.remove('opacity-50');
        });
        li.addEventListener('dragover', (e) => e.preventDefault());
        li.addEventListener('drop', async (e) => {
            e.preventDefault();
            const draggedCategory = e.dataTransfer.getData('text/plain');
            const targetCategory = li.dataset.category;
            if (draggedCategory && targetCategory && draggedCategory !== targetCategory) {
                const fromIndex = categories.indexOf(draggedCategory);
                const toIndex = categories.indexOf(targetCategory);
                const newCategories = [...categories];
                const [movedCategory] = newCategories.splice(fromIndex, 1);
                newCategories.splice(toIndex, 0, movedCategory);
                try {
                    const response = await fetch('/api/categories/reorder', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ categories: newCategories })
                    });
                    if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
                    categories = newCategories;
                    await renderCategories();
                } catch (error) {
                    console.error('Ошибка при перемещении категорий:', error);
                    alert('Не удалось переместить категорию.');
                }
            }
        });
    });

    document.querySelectorAll('.delete-category').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const category = e.target.dataset.category;
            try {
                const response = await fetch(`/api/categories/${encodeURIComponent(category)}`, { method: 'DELETE' });
                const result = await response.json();
                if (result.error) {
                    alert(result.error);
                } else {
                    if (currentCategory === category) currentCategory = null;
                    await renderCategories();
                    await renderTasks();
                }
            } catch (error) {
                console.error('Ошибка при удалении категории:', error);
                alert('Не удалось удалить категорию.');
            }
        });
    });
}

async function renderTasks() {
    try {
        const response = await fetch('/api/tasks');
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        const data = await response.json();
        
        // Сохраняем задачи в глобальную переменную
        tasks = data.tasks || [];
        const archived_tasks = data.archived_tasks || [];
        
        const taskList = document.getElementById('taskList');
        const taskForm = document.getElementById('taskForm');
        const taskListTitle = document.getElementById('taskListTitle');
        const archiveBtn = document.getElementById('archiveBtn');
        
        taskListTitle.textContent = showArchive ? 'Архив задач' : 'Мой список задач';
        taskForm.style.display = showArchive ? 'none' : 'flex';
        archiveBtn.style.display = showArchive ? 'none' : 'block';

        let filteredTasks = showArchive ? archived_tasks : tasks;
        
        if (!showArchive && currentCategory) {
            filteredTasks = filteredTasks.filter(task => task.category === currentCategory);
        }

        // Автоматическая сортировка
        filteredTasks.sort((a, b) => {
            if (a.completed !== b.completed) return a.completed ? 1 : -1;
            if (!a.datetime && !b.datetime) return 0;
            if (!a.datetime) return 1;
            if (!b.datetime) return -1;
            return new Date(a.datetime) - new Date(b.datetime);
        });

        const renderTask = (task, level = 0) => {
            const subtasks = tasks.filter(t => t.parent_id === task.id);
            const dependencies = task.dependencies ? task.dependencies.map(dep_id => {
                const depTask = tasks.find(t => t.id === dep_id);
                return depTask ? depTask.text : `ID ${dep_id}`;
            }).join(', ') : '';
            
            const formattedDate = task.datetime ? 
                new Date(task.datetime).toLocaleDateString('ru-RU') + ' ' + 
                new Date(task.datetime).toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'}) : '';
            
            return `
                <li class="flex items-center justify-between p-3 bg-white rounded-lg shadow ${task.completed ? 'bg-gray-200' : ''}" style="margin-left: ${level * 20}px">
                    <div class="flex items-center gap-2">
                        <input type="checkbox" ${task.completed ? 'checked' : ''} class="toggle-task" data-id="${task.id}" ${showArchive ? 'disabled' : ''}>
                        <div class="flex-1 ${showArchive ? '' : 'cursor-pointer open-task'}" data-id="${task.id}">
                            <span class="${task.completed ? 'line-through text-gray-500' : ''}">${task.text}</span>
                            <span class="text-sm text-gray-400">(${task.category}${formattedDate ? ', ' + formattedDate : ''})</span>
                            ${task.description ? `<p class="text-sm text-gray-600">${task.description}</p>` : ''}
                            ${dependencies ? `<p class="text-sm text-gray-600">Зависит от: ${dependencies}</p>` : ''}
                            ${task.files && task.files.length > 0 ? `
                                <div class="mt-2">
                                    <p class="text-sm font-medium">Файлы:</p>
                                    <div class="flex flex-wrap gap-2 mt-1">
                                        ${task.files.map(file => `
                                            <a href="/api/tasks/${task.id}/files/${file.id}" 
                                               target="_blank" 
                                               class="text-blue-500 hover:underline text-sm">
                                                ${file.name}
                                            </a>
                                        `).join('')}
                                    </div>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                    <button class="delete-task text-red-500 hover:text-red-700" data-id="${task.id}">Удалить</button>
                    ${subtasks.length > 0 ? `
                        <ul class="subtask-list ml-5 space-y-2">
                            ${subtasks.map(subtask => renderTask(subtask, level + 1)).join('')}
                        </ul>
                    ` : ''}
                </li>
            `;
        };

        taskList.innerHTML = filteredTasks.map(task => renderTask(task)).join('');
        
        document.querySelectorAll('.delete-task').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = parseInt(btn.dataset.id);
                const endpoint = showArchive ? `/api/archive/${id}` : `/api/tasks/${id}`;
                try {
                    const response = await fetch(endpoint, { method: 'DELETE' });
                    if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
                    await renderTasks();
                } catch (error) {
                    console.error('Ошибка при удалении задачи:', error);
                    alert('Не удалось удалить задачу.');
                }
            });
        });

        if (!showArchive) {
            document.querySelectorAll('.toggle-task').forEach(checkbox => {
                checkbox.addEventListener('change', async () => {
                    const id = parseInt(checkbox.dataset.id);
                    const task = tasks.find(t => t.id === id);
                    if (task) {
                        task.completed = checkbox.checked;
                        try {
                            const response = await fetch(`/api/tasks/${id}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(task)
                            });
                            if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
                            await renderTasks();
                        } catch (error) {
                            console.error('Ошибка при обновлении задачи:', error);
                            alert('Не удалось обновить задачу.');
                        }
                    }
                });
            });

            document.querySelectorAll('.open-task').forEach(div => {
                div.addEventListener('click', async () => {
                    const id = parseInt(div.dataset.id);
                    const task = tasks.find(t => t.id === id);
                    if (task) {
                        currentEditId = id;
                        document.getElementById('editTaskText').value = task.text || '';
                        document.getElementById('editTaskDateTime').value = task.datetime || '';
                        document.getElementById('editTaskDescription').value = task.description || '';
                        const categorySelect = document.getElementById('editTaskCategory');
                        categorySelect.innerHTML = categories.map(cat => `
                            <option value="${cat}" ${cat === task.category ? 'selected' : ''}>${cat}</option>
                        `).join('');
                        const editTaskParent = document.getElementById('editTaskParent');
                        const parentOptions = tasks
                            .filter(t => (t.parent_id === null || t.parent_id === undefined) && t.id !== id)
                            .map(t => `<option value="${t.id}" ${t.id === task.parent_id ? 'selected' : ''}>${t.text}</option>`)
                            .join('');
                        editTaskParent.innerHTML = '<option value="">Без родительской задачи</option>' + parentOptions;
                        await updateTaskFilesList(id);
                        document.getElementById('editModal').classList.remove('hidden');
                    }
                });
            });
        }
    } catch (error) {
        console.error('Ошибка при загрузке задач:', error);
        alert('Не удалось загрузить задачи. Проверьте подключение к серверу.');
    }
}

// Функция для обновления списка файлов
async function updateTaskFilesList(taskId) {
    try {
        const response = await fetch(`/api/tasks/${taskId}/files`);
        if (!response.ok) throw new Error('Ошибка получения файлов');

        const files = await response.json();
        const filesList = document.getElementById('taskFilesList');
        filesList.innerHTML = files.map(file => `
            <div class="flex items-center justify-between p-2 bg-gray-100 rounded">
                <a href="/api/tasks/${taskId}/files/${file.id}" 
                   target="_blank" 
                   class="text-blue-500 hover:underline">
                    ${file.name}
                </a>
                <button class="delete-file text-red-500 hover:text-red-700" 
                        data-fileid="${file.id}">
                    ✕
                </button>
            </div>
        `).join('');

        // Добавляем обработчики для удаления файлов
        document.querySelectorAll('.delete-file').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const fileId = e.target.dataset.fileid;
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
            });
        });
    } catch (error) {
        console.error('Ошибка при получении файлов:', error);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM fully loaded, initializing handlers');
    await renderCategories();
    await renderTasks();

    const addTaskBtn = document.getElementById('addTaskBtn');
    addTaskBtn.addEventListener('click', async () => {
        const taskInput = document.getElementById('taskInput');
        const taskDateTime = document.getElementById('taskDateTime');
        const taskText = taskInput.value.trim();
        const taskDateTimeValue = taskDateTime.value;
        if (!taskText) {
            alert('Введите текст задачи.');
            return;
        }
        if (!categories.length) {
            alert('Сначала добавьте хотя бы одну категорию.');
            return;
        }
        const task = {
            text: taskText,
            category: currentCategory || categories[0],
            datetime: taskDateTimeValue || null,
            description: '',
            completed: false,
            dependencies: [],
            files: []
        };
        try {
            const response = await fetch('/api/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(task)
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Ошибка при добавлении задачи.');
            }
            taskInput.value = '';
            taskDateTime.value = '';
            await renderTasks();
        } catch (error) {
            console.error('Ошибка при добавлении задачи:', error);
            alert(`Не удалось добавить задачу: ${error.message}`);
        }
    });

    const taskInput = document.getElementById('taskInput');
    taskInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addTaskBtn.click();
        }
    });

    const addCategoryBtn = document.getElementById('addCategoryBtn');
    addCategoryBtn.addEventListener('click', async () => {
        const categoryInput = document.getElementById('categoryInput');
        const categoryText = categoryInput.value.trim();
        if (!categoryText) {
            alert('Введите название категории.');
            return;
        }
        try {
            const response = await fetch('/api/categories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ category: categoryText })
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Ошибка при добавлении категории.');
            }
            categoryInput.value = '';
            await renderCategories();
            await renderTasks();
        } catch (error) {
            console.error('Ошибка при добавлении категории:', error);
            alert(`Не удалось добавить категорию: ${error.message}`);
        }
    });

    const categoryInput = document.getElementById('categoryInput');
    categoryInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addCategoryBtn.click();
        }
    });

    const showAllBtn = document.getElementById('showAllBtn');
    showAllBtn.addEventListener('click', () => {
        currentCategory = null;
        renderTasks();
    });

    const archiveBtn = document.getElementById('archiveBtn');
    archiveBtn.addEventListener('click', async () => {
        try {
            const response = await fetch('/api/archive', { method: 'POST' });
            if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
            await renderTasks();
        } catch (error) {
            console.error('Ошибка при архивировании задач:', error);
            alert('Не удалось архивировать задачи.');
        }
    });

    const toggleArchiveBtn = document.getElementById('toggleArchiveBtn');
    toggleArchiveBtn.addEventListener('click', () => {
        showArchive = !showArchive;
        toggleArchiveBtn.textContent = showArchive ? 'Показать активные' : 'Показать архив';
        renderTasks();
    });

    const cancelEditBtn = document.getElementById('cancelEditBtn');
    cancelEditBtn.addEventListener('click', () => {
        document.getElementById('editModal').classList.add('hidden');
        currentEditId = null;
    });

    const saveEditBtn = document.getElementById('saveEditBtn');
    saveEditBtn.addEventListener('click', async () => {
        if (currentEditId) {
            const parentSelect = document.getElementById('editTaskParent');
            const parentId = parentSelect.value ? parseInt(parentSelect.value) : null;

            const task = {
                text: document.getElementById('editTaskText').value,
                datetime: document.getElementById('editTaskDateTime').value,
                category: document.getElementById('editTaskCategory').value,
                description: document.getElementById('editTaskDescription').value,
                parent_id: parentId
            };

            try {
                const response = await fetch(`/api/tasks/${currentEditId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(task)
                });
                if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
                document.getElementById('editModal').classList.add('hidden');
                currentEditId = null;
                await renderTasks();
            } catch (error) {
                console.error('Ошибка при сохранении задачи:', error);
                alert('Не удалось сохранить задачу.');
            }
        }
    });

    const uploadFileBtn = document.getElementById('uploadFileBtn');
    uploadFileBtn.addEventListener('click', async () => {
        if (!currentEditId) return;

        const fileInput = document.getElementById('taskFileInput');
        if (!fileInput.files.length) {
            alert('Выберите файл для загрузки');
            return;
        }

        const formData = new FormData();
        for (let i = 0; i < fileInput.files.length; i++) {
            formData.append('files', fileInput.files[i]);
        }

        try {
            const response = await fetch(`/api/tasks/${currentEditId}/files`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error('Ошибка загрузки файла');

            await updateTaskFilesList(currentEditId);
            fileInput.value = '';
        } catch (error) {
            console.error('Ошибка при загрузке файла:', error);
            alert('Не удалось загрузить файл');
        }
    });

    const uploadTasksBtn = document.getElementById('uploadTasksBtn');
    uploadTasksBtn.addEventListener('click', () => {
        document.getElementById('uploadTasks').click();
    });

    const uploadTasks = document.getElementById('uploadTasks');
    uploadTasks.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            const formData = new FormData();
            formData.append('file', file);
            try {
                const response = await fetch('/api/tasks/upload', {
                    method: 'POST',
                    body: formData
                });
                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || 'Ошибка при загрузке задач.');
                }
                e.target.value = '';
                await renderTasks();
            } catch (error) {
                console.error('Ошибка при загрузке задач:', error);
                alert(`Не удалось загрузить задачи: ${error.message}`);
            }
        }
    });

    if (recognition) {
        const voiceInputBtn = document.getElementById('voiceInputBtn');
        voiceInputBtn.addEventListener('click', () => {
            recognition.start();
            voiceInputBtn.classList.add('bg-green-700');
        });
        recognition.onresult = (event) => {
            document.getElementById('taskInput').value = event.results[0][0].transcript;
            voiceInputBtn.classList.remove('bg-green-700');
        };
        recognition.onend = () => {
            voiceInputBtn.classList.remove('bg-green-700');
        };
    } else {
        document.getElementById('voiceInputBtn').disabled = true;
        document.getElementById('voiceInputBtn').title = 'Голосовой ввод не поддерживается';
    }
});
