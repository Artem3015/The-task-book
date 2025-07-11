// Инициализация Web Speech API
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'ru-RU';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
}

let currentCategory = null;
let sortMode = null;
let showArchive = false;
let currentEditId = null;
let categories = [];

async function fetchData() {
    try {
        const response = await fetch('/api/tasks');
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        const data = await response.json();
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
    const { tasks, archived_tasks } = await fetchData();
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

    if (sortMode === 'datetime') {
        filteredTasks.sort((a, b) => {
            if (!a.datetime && !b.datetime) return 0;
            if (!a.datetime) return 1;
            if (!b.datetime) return -1;
            return new Date(a.datetime) - new Date(b.datetime);
        });
    } else if (sortMode === 'date') {
        filteredTasks.sort((a, b) => {
            if (!a.datetime && !b.datetime) return 0;
            if (!a.datetime) return 1;
            if (!b.datetime) return -1;
            const dateA = new Date(a.datetime).setHours(0, 0, 0, 0);
            const dateB = new Date(b.datetime).setHours(0, 0, 0, 0);
            return dateA - dateB;
        });
    }

    taskList.innerHTML = filteredTasks.map(task => `
        <li class="flex items-center justify-between p-3 bg-white rounded-lg shadow ${task.completed ? 'bg-gray-200' : ''}">
            <div class="flex items-center gap-2">
                <input type="checkbox" ${task.completed ? 'checked' : ''} class="toggle-task" data-id="${task.id}" ${showArchive ? 'disabled' : ''}>
                <div class="flex-1 ${showArchive ? '' : 'cursor-pointer open-task'}" data-id="${task.id}">
                    <span class="${task.completed ? 'line-through text-gray-500' : ''}">${task.text}</span>
                    <span class="text-sm text-gray-400">(${task.category}${task.datetime ? ', ' + new Date(task.datetime).toLocaleString('ru-RU') : ''})</span>
                    ${task.description ? `<p class="text-sm text-gray-600">${task.description}</p>` : ''}
                </div>
            </div>
            <button class="delete-task text-red-500 hover:text-red-700" data-id="${task.id}">Удалить</button>
        </li>
    `).join('');

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
                    document.getElementById('editTaskText').value = task.text;
                    document.getElementById('editTaskDateTime').value = task.datetime || '';
                    document.getElementById('editTaskDescription').value = task.description || '';
                    const categorySelect = document.getElementById('editTaskCategory');
                    categorySelect.innerHTML = categories.map(cat => `
                        <option value="${cat}" ${cat === task.category ? 'selected' : ''}>${cat}</option>
                    `).join('');
                    document.getElementById('editModal').classList.remove('hidden');
                }
            });
        });
    }
}

// Инициализация обработчиков событий
document.addEventListener('DOMContentLoaded', async () => {
    await renderCategories(); // Загружаем категории первыми
    await renderTasks(); // Затем задачи

    document.getElementById('addTaskBtn').addEventListener('click', async () => {
        const taskText = document.getElementById('taskInput').value.trim();
        const taskDateTime = document.getElementById('taskDateTime').value;
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
            datetime: taskDateTime || null,
            description: '',
            completed: false
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
            document.getElementById('taskInput').value = '';
            document.getElementById('taskDateTime').value = '';
            await renderTasks();
        } catch (error) {
            console.error('Ошибка при добавлении задачи:', error);
            alert(`Не удалось добавить задачу: ${error.message}`);
        }
    });

    document.getElementById('taskInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('addTaskBtn').click();
    });

    document.getElementById('addCategoryBtn').addEventListener('click', async () => {
        const categoryText = document.getElementById('categoryInput').value.trim();
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
            document.getElementById('categoryInput').value = '';
            await renderCategories();
            await renderTasks();
        } catch (error) {
            console.error('Ошибка при добавлении категории:', error);
            alert(`Не удалось добавить категорию: ${error.message}`);
        }
    });

    document.getElementById('categoryInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('addCategoryBtn').click();
    });

    document.getElementById('showAllBtn').addEventListener('click', () => {
        currentCategory = null;
        renderTasks();
    });

    document.getElementById('sortByDateTime').addEventListener('click', () => {
        sortMode = 'datetime';
        renderTasks();
    });

    document.getElementById('sortByDate').addEventListener('click', () => {
        sortMode = 'date';
        renderTasks();
    });

    document.getElementById('archiveBtn').addEventListener('click', async () => {
        try {
            const response = await fetch('/api/archive', { method: 'POST' });
            if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
            await renderTasks();
        } catch (error) {
            console.error('Ошибка при архивировании задач:', error);
            alert('Не удалось архивировать задачи.');
        }
    });

    document.getElementById('toggleArchiveBtn').addEventListener('click', () => {
        showArchive = !showArchive;
        document.getElementById('toggleArchiveBtn').textContent = showArchive ? 'Показать активные' : 'Показать архив';
        renderTasks();
    });

    document.getElementById('cancelEditBtn').addEventListener('click', () => {
        document.getElementById('editModal').classList.add('hidden');
        currentEditId = null;
    });

    document.getElementById('saveEditBtn').addEventListener('click', async () => {
        if (currentEditId) {
            const task = {
                text: document.getElementById('editTaskText').value,
                datetime: document.getElementById('editTaskDateTime').value,
                category: document.getElementById('editTaskCategory').value,
                description: document.getElementById('editTaskDescription').value
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

    document.getElementById('uploadTasksBtn').addEventListener('click', () => {
        document.getElementById('uploadTasks').click();
    });

    document.getElementById('uploadTasks').addEventListener('change', async (e) => {
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
        document.getElementById('voiceInputBtn').addEventListener('click', () => {
            recognition.start();
            document.getElementById('voiceInputBtn').classList.add('bg-green-700');
        });
        recognition.onresult = (event) => {
            document.getElementById('taskInput').value = event.results[0][0].transcript;
            document.getElementById('voiceInputBtn').classList.remove('bg-green-700');
        };
        recognition.onend = () => {
            document.getElementById('voiceInputBtn').classList.remove('bg-green-700');
        };
    } else {
        document.getElementById('voiceInputBtn').disabled = true;
        document.getElementById('voiceInputBtn').title = 'Голосовой ввод не поддерживается';
    }
});