const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let daysFilter = 7;
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
let users = [];
let currentEditChatId = null;
let contactSortField = 'name';
let contactSortOrder = 'asc';
let contactSearchQuery = '';
let currentEditCategory = null;

async function fetchData() {
    try {
        const response = await fetch('/api/tasks', { timeout: 5000 });
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
        console.log('Запрашиваем категории с /api/categories');
        const response = await fetch('/api/categories', { timeout: 5000 });
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        const newCategories = await response.json();
        console.log('Получены категории:', newCategories);
        categories = newCategories;
        return categories;
    } catch (error) {
        console.error('Ошибка загрузки категорий:', error);
        alert('Не удалось загрузить категории. Проверьте подключение к серверу.');
        return [];
    }
}

async function fetchUsers() {
    try {
        console.log('Fetching users from /api/users');
        const response = await fetch('/api/users', { timeout: 5000 });
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        users = await response.json();
        console.log('Fetched users:', users);
        return users;
    } catch (error) {
        console.error('Ошибка загрузки пользователей:', error);
        alert('Не удалось загрузить пользователей. Проверьте подключение к серверу.');
        return [];
    }
}

async function renderTaskGroups() {
    await fetchUsers();
    const taskGroupSelect = document.getElementById('taskGroup');
    const editTaskGroupSelect = document.getElementById('editTaskGroup');
    const groups = [...new Set(users.map(user => user.group).filter(group => group))];

    taskGroupSelect.innerHTML = `<option value="">Без группы</option>` +
        groups.map(group => `<option value="${group}">${group}</option>`).join('');

    editTaskGroupSelect.innerHTML = `<option value="">Без группы</option>` +
        groups.map(group => `<option value="${group}">${group}</option>`).join('');
}

async function renderCategories() {
    await fetchCategories();
    const categoryList = document.getElementById('categoryList');
    if (!categoryList) {
        console.error('Element #categoryList not found');
        return;
    }
    if (!categories || !Array.isArray(categories)) {
        console.error('Категории не загружены или имеют неверный формат:', categories);
        categoryList.innerHTML = '<li>Категории не доступны</li>';
        return;
    }
    categoryList.innerHTML = categories.map(category => `
        <li draggable="true" class="p-2 rounded-lg cursor-pointer hover:bg-opacity-80 flex justify-between items-center" style="background-color: ${category.color || '#e5e7eb'};" data-category="${category.name}">
            <span class="edit-category cursor-pointer">${category.name || 'Без названия'}</span>
            <button class="delete-category text-red-500 hover:text-red-700" data-category="${category.name}">✕</button>
        </li>
    `).join('');

    document.querySelectorAll('#categoryList li').forEach(li => {
        li.addEventListener('click', (e) => {
            if (!e.target.closest('.delete-category') && !e.target.closest('.edit-category')) {
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
                const fromIndex = categories.findIndex(cat => cat.name === draggedCategory);
                const toIndex = categories.findIndex(cat => cat.name === targetCategory);
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

    document.querySelectorAll('.edit-category').forEach(span => {
        span.addEventListener('click', () => {
            const categoryName = span.parentElement.dataset.category;
            const category = categories.find(cat => cat.name === categoryName);
            if (category) {
                currentEditCategory = categoryName;
                document.getElementById('editCategoryName').value = category.name || '';
                document.getElementById('editCategoryColor').value = category.color || '';
                document.getElementById('editCategoryModal').classList.remove('hidden');
            } else {
                console.error('Категория не найдена для редактирования:', categoryName);
            }
        });
    });

    document.querySelectorAll('.delete-category').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const category = e.target.dataset.category;
            if (confirm(`Вы уверены, что хотите удалить категорию "${category}"?`)) {
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
                    alert('Не удалось удалить категорию. Проверьте подключение к серверу.');
                }
            }
        });
    });
}

async function renderTasks() {
    try {
        const response = await fetch('/api/tasks', { timeout: 5000 });
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        const data = await response.json();

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

        // Применяем фильтр по дням (только для активных задач)
        if (!showArchive) {
            const now = new Date();
            const endDate = new Date();
            endDate.setDate(now.getDate() + daysFilter);

            filteredTasks = filteredTasks.filter(task => {
                if (!task.datetime) return true; // Задачи без даты показываем всегда
                const taskDate = new Date(task.datetime);
                return taskDate <= endDate;
            });
        }

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
                new Date(task.datetime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';

            const contact = task.chat_id ? users.find(u => u.chat_id === task.chat_id) : null;
            const contactDisplay = contact ? `${contact.name} (${contact.username})` : '';
            const groupDisplay = task.group ? `Группа: ${task.group}` : '';
            const category = categories.find(cat => cat.name === task.category);
            const taskColor = category && category.color ? `${category.color}33` : '#f3f4f6';

            // Добавляем информацию о повторении
            let repeatInfo = '';
            if (task.repeat_interval) {
                const intervals = {
                    'day': 'Ежедневно',
                    'week': 'Еженедельно',
                    'month': 'Ежемесячно',
                    'quarter': 'Ежеквартально',
                    'year': 'Ежегодно'
                };
                repeatInfo = `<span class="text-sm text-blue-600">${intervals[task.repeat_interval]}</span>`;

                if (task.repeat_count) {
                    repeatInfo += `, <span class="text-sm text-blue-600">${task.repeat_count} повторений</span>`;
                }
                if (task.repeat_until) {
                    repeatInfo += `, <span class="text-sm text-blue-600">до ${new Date(task.repeat_until).toLocaleDateString('ru-RU')}</span>`;
                }
            }

            return `
        <li class="flex items-center justify-between p-3 rounded-lg shadow ${task.completed ? 'bg-gray-200' : ''} ${task.repeat_interval ? 'repeating-task' : ''}" 
            style="background-color: ${taskColor}; margin-left: ${level * 20}px">
            <div class="flex items-center gap-2">
                <input type="checkbox" ${task.completed ? 'checked' : ''} class="toggle-task" data-id="${task.id}" ${showArchive ? 'disabled' : ''}>
                <div class="flex-1 ${showArchive ? '' : 'cursor-pointer open-task'}" data-id="${task.id}">
                    <span class="${task.completed ? 'line-through text-gray-500' : ''}">${task.text}</span>
                    <span class="text-sm text-gray-400">(${task.category}${formattedDate ? ', ' + formattedDate : ''}${task.reminder_time ? ', напоминание за ' + task.reminder_time + ' мин' : ''}${groupDisplay ? ', ' + groupDisplay : ''})</span>
                    ${repeatInfo ? `<div class="mt-1">${repeatInfo}</div>` : ''}
                    ${task.description ? `<p class="text-sm text-gray-600">${task.description}</p>` : ''}
                    ${dependencies ? `<p class="text-sm text-gray-600">Зависит от: ${dependencies}</p>` : ''}
                    ${contactDisplay ? `<p class="text-sm text-gray-600">Контакт: ${contactDisplay}</p>` : ''}
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
                        document.getElementById('editTaskReminderTime').value = task.reminder_time || '';
                        document.getElementById('editTaskDescription').value = task.description || '';
                        const categorySelect = document.getElementById('editTaskCategory');
                        categorySelect.innerHTML = categories.map(cat => `
    <option value="${cat.name}" ${cat.name === task.category ? 'selected' : ''}>${cat.name}</option>
        `).join('');
                        const contactSelect = document.getElementById('editTaskContact');
                        await fetchUsers();
                        contactSelect.innerHTML = `<option value="">Без контакта</option>` + users.map(user => `
    <option value="${user.chat_id}" ${user.chat_id === task.chat_id ? 'selected' : ''}>${user.name} (${user.username})</option>
        `).join('');
                        const editTaskGroup = document.getElementById('editTaskGroup');
                        const groups = [...new Set(users.map(user => user.group).filter(group => group))];
                        editTaskGroup.innerHTML = `<option value="">Без группы</option>` +
                            groups.map(group => `<option value="${group}" ${group === task.group ? 'selected' : ''}>${group}</option>`).join('');
                        const editTaskParent = document.getElementById('editTaskParent');
                        const parentOptions = tasks
                            .filter(t => (t.parent_id === null || t.parent_id === undefined) && t.id !== id)
                            .map(t => `<option value="${t.id}" ${t.id === task.parent_id ? 'selected' : ''}>${t.text}</option>`).join('');
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

async function checkRepeatingTasks() {
    try {
        const response = await fetch('/api/tasks/process_repeating', {
            method: 'POST'
        });
        if (!response.ok) throw new Error('Ошибка обработки повторяющихся задач');
        const result = await response.json();
        if (result.created > 0) {
            await renderTasks();
        }
    } catch (error) {
        console.error('Ошибка при проверке повторяющихся задач:', error);
    }
}

// Вызываем при загрузке и периодически
document.addEventListener('DOMContentLoaded', async () => {
    await checkRepeatingTasks();
    const daysFilterInput = document.getElementById('daysFilter');
    const applyDaysFilterBtn = document.getElementById('applyDaysFilter');

    if (daysFilterInput && applyDaysFilterBtn) {
        // Применяем фильтр при нажатии кнопки
        applyDaysFilterBtn.addEventListener('click', () => {
            const value = parseInt(daysFilterInput.value);
            if (!isNaN(value) && value > 0) {
                daysFilter = value;
                renderTasks();
            }
        });

        // Применяем фильтр при нажатии Enter
        daysFilterInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                applyDaysFilterBtn.click();
            }
        });
    }
    setInterval(checkRepeatingTasks, 3600000); // Проверяем каждый час
});


async function updateTaskFilesList(taskId) {
    try {
        const response = await fetch(`/api/tasks/${taskId}/files`, { timeout: 5000 });
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

async function renderContacts() {
    console.log('Rendering contacts with query:', contactSearchQuery, 'sort:', contactSortField, contactSortOrder);
    const contactList = document.getElementById('contactList');
    if (!contactList) {
        console.error('Element #contactList not found');
        return;
    }

    await fetchUsers();

    let filteredUsers = users.filter(user => {
        if (!contactSearchQuery) return true;
        const query = contactSearchQuery.toLowerCase();
        return (
            user.name.toLowerCase().includes(query) ||
            (user.username && user.username.toLowerCase().includes(query)) ||
            (user.group && user.group.toLowerCase().includes(query))
        );
    });

    filteredUsers.sort((a, b) => {
        const aValue = a[contactSortField] || '';
        const bValue = b[contactSortField] || '';
        if (contactSortField === 'name' || contactSortField === 'username' || contactSortField === 'group') {
            return contactSortOrder === 'asc'
                ? aValue.localeCompare(bValue)
                : bValue.localeCompare(aValue);
        }
        return 0;
    });

    contactList.innerHTML = filteredUsers.map(user => `
        <tr class="border-b">
            <td class="p-2">
                <span class="contact-name" data-chatid="${user.chat_id}">${user.name}</span>
                <input type="text" class="contact-name-input hidden p-1 border rounded" data-chatid="${user.chat_id}" value="${user.name}">
            </td>
            <td class="p-2">${user.username || ''}</td>
            <td class="p-2">${user.group || ''}</td>
            <td class="p-2">
                <button class="edit-contact text-blue-500 hover:text-blue-700 mr-2" data-chatid="${user.chat_id}">Редактировать</button>
                <button class="delete-contact text-red-500 hover:text-red-700" data-chatid="${user.chat_id}">Удалить</button>
            </td>
        </tr>
    `).join('');

    document.querySelectorAll('.edit-contact').forEach(btn => {
        btn.addEventListener('click', () => {
            const chatId = parseInt(btn.dataset.chatid);
            const user = users.find(u => u.chat_id === chatId);
            if (user) {
                currentEditChatId = chatId;
                document.getElementById('editContactName').value = user.name || '';
                document.getElementById('editContactUsername').value = user.username || '';
                document.getElementById('editContactGroup').value = user.group || '';
                document.getElementById('editContactModal').classList.remove('hidden');
            }
        });
    });

    document.querySelectorAll('.delete-contact').forEach(btn => {
        btn.addEventListener('click', async () => {
            const chatId = parseInt(btn.dataset.chatid);
            if (confirm('Вы уверены, что хотите удалить этот контакт?')) {
                try {
                    const response = await fetch(`/api/users/${chatId}`, {
                        method: 'DELETE'
                    });
                    if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
                    await renderContacts();
                } catch (error) {
                    console.error('Ошибка при удалении контакта:', error);
                    alert('Не удалось удалить контакт.');
                }
            }
        });
    });

    document.querySelectorAll('.contact-name').forEach(span => {
        span.addEventListener('click', () => {
            const chatId = parseInt(span.dataset.chatid);
            span.classList.add('hidden');
            const input = span.parentElement.querySelector('.contact-name-input');
            input.classList.remove('hidden');
            input.focus();
        });
    });

    document.querySelectorAll('.contact-name-input').forEach(input => {
        input.addEventListener('blur', async () => {
            const chatId = parseInt(input.dataset.chatid);
            const newName = input.value.trim();
            if (newName) {
                try {
                    const response = await fetch(`/api/users/${chatId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: newName })
                    });
                    if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
                    input.classList.add('hidden');
                    const span = input.parentElement.querySelector('.contact-name');
                    span.textContent = newName;
                    span.classList.remove('hidden');
                    await fetchUsers();
                    await renderTaskGroups();
                    renderContacts();
                } catch (error) {
                    console.error('Ошибка при сохранении имени:', error);
                    alert('Не удалось сохранить имя.');
                }
            }
        });

        input.addEventListener('keypress', async (e) => {
            if (e.key === 'Enter') {
                input.blur();
            }
        });
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM fully loaded, initializing handlers');
    if (document.getElementById('contactList')) {
        console.log('Contact list detected, rendering contacts');
        await renderContacts();

        const contactSearch = document.getElementById('contactSearch');
        contactSearch.addEventListener('input', () => {
            console.log('Search query:', contactSearch.value);
            contactSearchQuery = contactSearch.value.trim();
            renderContacts();
        });

        const savedFilter = localStorage.getItem('daysFilter');
        if (savedFilter) {
            daysFilter = parseInt(savedFilter);
            if (daysFilterInput) {
                daysFilterInput.value = daysFilter;
            }
        }

        document.querySelectorAll('#contactList th[data-sort]').forEach(th => {
            th.addEventListener('click', () => {
                console.log('Sorting by:', th.dataset.sort);
                const field = th.dataset.sort;
                if (contactSortField === field) {
                    contactSortOrder = contactSortOrder === 'asc' ? 'desc' : 'asc';
                } else {
                    contactSortField = field;
                    contactSortOrder = 'asc';
                }
                renderContacts();
            });
        });

        const addContactBtn = document.getElementById('addContactBtn');
        if (addContactBtn) {
            addContactBtn.addEventListener('click', async () => {
                const usernameInput = document.getElementById('addContactUsername');
                const username = usernameInput.value.trim();
                if (!username || !username.startsWith('@')) {
                    alert('Введите корректный Telegram username, начинающийся с @');
                    return;
                }
                try {
                    const response = await fetch('/api/users', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username })
                    });
                    if (!response.ok) {
                        const error = await response.json();
                        throw new Error(error.error || 'Ошибка при добавлении пользователя');
                    }
                    usernameInput.value = '';
                    await renderContacts();
                    await renderTaskGroups();
                } catch (error) {
                    console.error('Ошибка при добавлении пользователя:', error);
                    alert(`Не удалось добавить пользователя: ${error.message}`);
                }
            });
        }

        const cancelContactEditBtn = document.getElementById('cancelContactEditBtn');
        if (cancelContactEditBtn) {
            cancelContactEditBtn.addEventListener('click', () => {
                document.getElementById('editContactModal').classList.add('hidden');
                currentEditChatId = null;
            });
        }

        const saveContactEditBtn = document.getElementById('saveContactEditBtn');
        if (saveContactEditBtn) {
            saveContactEditBtn.addEventListener('click', async () => {
                if (currentEditChatId) {
                    const user = {
                        name: document.getElementById('editContactName').value.trim(),
                        group: document.getElementById('editContactGroup').value.trim()
                    };
                    try {
                        const response = await fetch(`/api/users/${currentEditChatId}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(user)
                        });
                        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
                        document.getElementById('editContactModal').classList.add('hidden');
                        currentEditChatId = null;
                        await renderContacts();
                        await renderTaskGroups();
                    } catch (error) {
                        console.error('Ошибка при сохранении контакта:', error);
                        alert('Не удалось сохранить контакт.');
                    }
                }
            });
        }
    } else {
        await renderCategories();
        await renderTasks();
        await renderTaskGroups();

        const addCategoryBtn = document.getElementById('addCategoryBtn');
        if (addCategoryBtn) {
            addCategoryBtn.addEventListener('click', async () => {
                console.log('Кнопка добавления категории нажата');
                const categoryInput = document.getElementById('categoryInput');
                const categoryColor = document.getElementById('categoryColor');
                if (!categoryInput) {
                    console.error('Элемент categoryInput не найден');
                    alert('Ошибка: поле ввода названия категории не найдено');
                    return;
                }
                const categoryText = categoryInput.value.trim();
                const categoryColorValue = categoryColor ? categoryColor.value : '';
                if (!categoryText) {
                    alert('Введите название категории.');
                    return;
                }
                try {
                    console.log('Отправка запроса на добавление категории:', { name: categoryText, color: categoryColorValue });
                    const response = await fetch('/api/categories', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: categoryText, color: categoryColorValue || null })
                    });
                    if (!response.ok) {
                        const error = await response.json();
                        throw new Error(error.error || 'Ошибка при добавлении категории.');
                    }
                    console.log('Категория успешно добавлена');
                    categoryInput.value = '';
                    if (categoryColor) categoryColor.value = '';
                    await renderCategories();
                    await renderTasks();
                } catch (error) {
                    console.error('Ошибка при добавлении категории:', error);
                    alert(`Не удалось добавить категорию: ${error.message}`);
                }
            });
        }

        const categoryInput = document.getElementById('categoryInput');
        if (categoryInput) {
            categoryInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    addCategoryBtn.click();
                }
            });
        }

        const showAllBtn = document.getElementById('showAllBtn');
        if (showAllBtn) {
            showAllBtn.addEventListener('click', () => {
                currentCategory = null;
                renderTasks();
            });
        }

        const archiveBtn = document.getElementById('archiveBtn');
        if (archiveBtn) {
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
        }

        const toggleArchiveBtn = document.getElementById('toggleArchiveBtn');
        if (toggleArchiveBtn) {
            toggleArchiveBtn.addEventListener('click', () => {
                showArchive = !showArchive;
                toggleArchiveBtn.textContent = showArchive ? 'Показать активные' : 'Показать архив';
                renderTasks();
            });
        }

        const cancelEditBtn = document.getElementById('cancelEditBtn');
        if (cancelEditBtn) {
            cancelEditBtn.addEventListener('click', () => {
                document.getElementById('editModal').classList.add('hidden');
                currentEditId = null;
            });
        }

        const saveEditBtn = document.getElementById('saveEditBtn');
        if (saveEditBtn) {
            saveEditBtn.addEventListener('click', async () => {
                if (currentEditId) {
                    const parentSelect = document.getElementById('editTaskParent');
                    const parentId = parentSelect.value ? parseInt(parentSelect.value) : null;
                    const contactSelect = document.getElementById('editTaskContact');
                    const chatId = contactSelect.value ? parseInt(contactSelect.value) : null;
                    const groupSelect = document.getElementById('editTaskGroup');
                    const group = groupSelect.value || null;
                    const categorySelect = document.getElementById('editTaskCategory');
                    const category = categorySelect.value;

                    if (!category || !categories.some(cat => cat.name === category)) {
                        alert('Выберите существующую категорию.');
                        return;
                    }

                    const task = {
                        text: document.getElementById('editTaskText').value,
                        datetime: document.getElementById('editTaskDateTime').value,
                        reminder_time: document.getElementById('editTaskReminderTime').value || null,
                        category: category,
                        description: document.getElementById('editTaskDescription').value,
                        parent_id: parentId,
                        chat_id: chatId,
                        group: group,
                        repeat_interval: document.getElementById('editTaskRepeatInterval').value || null,
                        repeat_count: document.getElementById('editTaskRepeatCount').value ?
                            parseInt(document.getElementById('editTaskRepeatCount').value) : null,
                        repeat_until: document.getElementById('editTaskRepeatUntil').value || null
                    };

                    try {
                        const response = await fetch(`/api/tasks/${currentEditId}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(task)
                        });
                        if (!response.ok) {
                            const error = await response.json();
                            throw new Error(error.error || 'Ошибка при сохранении задачи.');
                        }
                        document.getElementById('editModal').classList.add('hidden');
                        currentEditId = null;
                        await renderTasks();
                    } catch (error) {
                        console.error('Ошибка при сохранении задачи:', error);
                        alert(`Не удалось сохранить задачу: ${error.message}`);
                    }
                }
            });
        }

        const repeatTaskBtn = document.getElementById('repeatTaskBtn');
        if (repeatTaskBtn) {
            repeatTaskBtn.addEventListener('click', async () => {
                if (currentEditId) {
                    const repeatInterval = document.getElementById('editTaskRepeatInterval').value;
                    if (!repeatInterval) {
                        alert('Выберите интервал повторения');
                        return;
                    }

                    try {
                        const response = await fetch(`/api/tasks/${currentEditId}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                repeat_interval: repeatInterval,
                                repeat_count: document.getElementById('editTaskRepeatCount').value ?
                                    parseInt(document.getElementById('editTaskRepeatCount').value) : null,
                                repeat_until: document.getElementById('editTaskRepeatUntil').value || null
                            })
                        });

                        if (!response.ok) throw new Error('Ошибка при сохранении повторения');

                        alert('Повторение задачи успешно настроено');
                        document.getElementById('editModal').classList.add('hidden');
                        await renderTasks();
                    } catch (error) {
                        console.error('Ошибка при настройке повторения:', error);
                        alert('Не удалось настроить повторение задачи');
                    }
                }
            });
        }


        const cancelCategoryEditBtn = document.getElementById('cancelCategoryEditBtn');
        if (cancelCategoryEditBtn) {
            cancelCategoryEditBtn.addEventListener('click', () => {
                document.getElementById('editCategoryModal').classList.add('hidden');
                currentEditCategory = null;
            });
        }

        const saveCategoryEditBtn = document.getElementById('saveCategoryEditBtn');
        if (saveCategoryEditBtn) {
            saveCategoryEditBtn.addEventListener('click', async () => {
                if (currentEditCategory) {
                    const newName = document.getElementById('editCategoryName').value.trim();
                    const newColor = document.getElementById('editCategoryColor') ? document.getElementById('editCategoryColor').value : '';
                    if (!newName) {
                        alert('Введите название категории.');
                        return;
                    }
                    try {
                        console.log('Отправка запроса на обновление категории:', { name: newName, color: newColor });
                        const response = await fetch(`/api/categories/${encodeURIComponent(currentEditCategory)}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: newName, color: newColor || null })
                        });
                        if (!response.ok) {
                            const error = await response.json();
                            throw new Error(error.error || 'Ошибка при обновлении категории.');
                        }
                        document.getElementById('editCategoryModal').classList.add('hidden');
                        currentEditCategory = null;
                        await renderCategories();
                        await renderTasks();
                    } catch (error) {
                        console.error('Ошибка при обновлении категории:', error);
                        alert(`Не удалось обновить категорию: ${error.message}`);
                    }
                }
            });
        }

        const uploadFileBtn = document.getElementById('uploadFileBtn');
        if (uploadFileBtn) {
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
        }

        const uploadTasksBtn = document.getElementById('uploadTasksBtn');
        if (uploadTasksBtn) {
            uploadTasksBtn.addEventListener('click', () => {
                document.getElementById('uploadTasks').click();
            });
        }

        const uploadTasks = document.getElementById('uploadTasks');
        if (uploadTasks) {
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
        }

        if (recognition) {
            const voiceInputBtn = document.getElementById('voiceInputBtn');
            if (voiceInputBtn) {
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
            }
        } else {
            const voiceInputBtn = document.getElementById('voiceInputBtn');
            if (voiceInputBtn) {
                voiceInputBtn.disabled = true;
                voiceInputBtn.title = 'Голосовой ввод не поддерживается';
            }
        }
    }
    const addTaskBtn = document.getElementById('addTaskBtn');
    if (addTaskBtn) {
        addTaskBtn.addEventListener('click', async () => {
            const taskText = document.getElementById('taskInput').value.trim();
            if (!taskText) {
                alert('Введите текст задачи');
                return;
            }

            const taskData = {
                text: taskText,
                datetime: document.getElementById('taskDateTime').value || null,
                reminder_time: document.getElementById('taskReminderTime').value || null,
                description: document.getElementById('taskDescription').value || '',
                category: document.getElementById('taskCategory').value || (categories[0]?.name || 'Без категории'),
                parent_id: document.getElementById('taskParent').value ? parseInt(document.getElementById('taskParent').value) : null,
                chat_id: document.getElementById('taskTelegram').value || null,
                group: document.getElementById('taskGroup').value || null,
                repeat_interval: document.getElementById('taskRepeatInterval').value || null,
                repeat_count: document.getElementById('taskRepeatCount').value ?
                    parseInt(document.getElementById('taskRepeatCount').value) : null,
                repeat_until: document.getElementById('taskRepeatUntil').value || null
            };

            try {
                const response = await fetch('/api/tasks', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(taskData)
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || 'Ошибка при добавлении задачи');
                }

                // Очищаем поля формы
                document.getElementById('taskInput').value = '';
                document.getElementById('taskDateTime').value = '';
                document.getElementById('taskReminderTime').value = '';
                document.getElementById('taskDescription').value = '';
                document.getElementById('taskRepeatInterval').value = '';
                document.getElementById('taskRepeatCount').value = '';
                document.getElementById('taskRepeatUntil').value = '';

                // Обновляем список задач
                await renderTasks();
            } catch (error) {
                console.error('Ошибка при добавлении задачи:', error);
                alert(`Не удалось добавить задачу: ${error.message}`);
            }
        });
    }

});