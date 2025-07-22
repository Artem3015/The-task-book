import { formatDateTime, debounce, escapeRegExp } from './utils.js';
import { updateTaskFilesList } from './files.js';


//глобальные переменные
let users = [];
let showArchive = false;

setInterval(async () => {
    await fetchTasks();
    await renderTasks();
}, 5000); 

export async function initializeTasks() {
    console.log('Инициализация задач:', {
        currentCategory: window.currentCategory,
        daysFilter: window.daysFilter,
        searchInput: document.getElementById('searchInput')?.value || 'Пусто'
    });

    // Устанавливаем daysFilter в 0 для начального рендеринга (показать все задачи)
    window.daysFilter = 0;
    // Устанавливаем значение 7 в интерфейсе
    if (document.getElementById('daysFilter')) {
        document.getElementById('daysFilter').value = '7';
    }
    localStorage.setItem('daysFilter', '7');
    await fetchUsers();
    await fetchTasks();
    document.getElementById('addTaskBtn')?.addEventListener('click', addTask);
    document.getElementById('toggleArchiveBtn')?.addEventListener('click', toggleArchive);
    document.getElementById('archiveBtn')?.addEventListener('click', archiveCompletedTasks);
    document.getElementById('searchInput')?.addEventListener('input', debounce(searchTasks, 300));
    document.getElementById('daysFilter')?.addEventListener('change', applyDaysFilter);
    document.getElementById('resetFiltersBtn')?.addEventListener('click', resetFilters);
    document.getElementById('showAdvancedBtn')?.addEventListener('click', toggleAdvancedFields);
    document.getElementById('quickAddBtn')?.addEventListener('click', showQuickAddModal);
    document.getElementById('confirmQuickAddBtn')?.addEventListener('click', addMultipleTasks);
    document.getElementById('sortTasksBtn')?.addEventListener('click', toggleSortOptions);
    await updateTaskStats();
    setInterval(checkRepeatingTasks, 3600000);
    setInterval(updateTaskStats, 60000);
    await renderTasks();
}

export async function initializeCategories() {
    await fetchCategories();
    renderCategories();
    await updateTaskCategorySelect(); // Добавляем обновление выпадающего списка
    setupCategoryEventListeners();
    setupDragAndDrop();
}

export async function updateTaskCategorySelect() {
    await fetchCategories();
    const taskCategorySelect = document.getElementById('taskCategory');
    const editTaskCategorySelect = document.getElementById('editTaskCategory');

    const options = window.categories.map(category =>
        `<option value="${category.name}">${category.name}</option>`
    ).join('');

    if (taskCategorySelect) {
        taskCategorySelect.innerHTML = '<option value="">Без категории</option>' + options;
    }

    if (editTaskCategorySelect) {
        editTaskCategorySelect.innerHTML = '<option value="">Без категории</option>' + options;
    }
}

async function fetchTasks() {
    try {
        const response = await fetch('/api/tasks', { timeout: 5000 });
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        const data = await response.json();
        window.tasks = data.tasks || [];
        window.archivedTasks = data.archived_tasks || [];
        console.log('Полученные задачи:', window.tasks); // Отладка
        console.log('Задачи без даты:', window.tasks.filter(task => !task.datetime)); // Отладка
        return data;
    } catch (error) {
        console.error('Ошибка загрузки задач:', error);
        alert('Не удалось загрузить задачи. Проверьте подключение к серверу.');
        return { tasks: [], archived_tasks: [] };
    }
}

async function fetchUsers() {
    try {
        const response = await fetch('/api/users', { timeout: 5000 });
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        users = await response.json(); // Сохраняем в локальную переменную
        return users;
    } catch (error) {
        console.error('Ошибка загрузки пользователей:', error);
        return [];
    }
}

document.getElementById('saveEditBtn')?.addEventListener('click', async () => {
    try {
        const taskId = window.currentEditId;
        if (!taskId) return;

        const taskData = {
            text: document.getElementById('editTaskText').value.trim(),
            datetime: document.getElementById('editTaskDateTime').value || null,
            reminder_time: document.getElementById('editTaskReminderTime').value || null,
            description: document.getElementById('editTaskDescription').value.trim(),
            category: document.getElementById('editTaskCategory').value || null,
            chat_ids: [document.getElementById('editTaskContact').value].filter(Boolean), // Изменено на chat_ids
            group: document.getElementById('editTaskGroup').value || null,
            parent_id: document.getElementById('editTaskParent').value || null,
            completed: document.querySelector(`.toggle-task[data-id="${taskId}"]`)?.checked || false // Добавлено completed
        };

        const response = await fetch(`/api/tasks/${taskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(taskData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Ошибка при обновлении задачи');
        }

        document.getElementById('editModal').classList.add('hidden');
        await renderTasks();
    } catch (error) {
        console.error('Ошибка при сохранении задачи:', error);
        alert(error.message || 'Не удалось сохранить задачу');
    }
});

document.getElementById('cancelEditBtn')?.addEventListener('click', () => {
    document.getElementById('editModal').classList.add('hidden');
});

async function renderTasks() {
    try {
        const taskList = document.getElementById('taskList');
        if (!taskList) return;
        const response = await fetch('/api/tasks', { timeout: 5000 });
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        const data = await response.json();

        tasks = data.tasks || [];
        const archived_tasks = data.archived_tasks || [];

        const taskForm = document.getElementById('taskForm');
        const taskListTitle = document.getElementById('taskListTitle');
        const archiveBtn = document.getElementById('archiveBtn');

        taskListTitle.textContent = showArchive ? 'Архив задач' : 'Мой список задач';
        taskForm.style.display = showArchive ? 'none' : 'flex';
        archiveBtn.style.display = showArchive ? 'none' : 'block';

        let filteredTasks = showArchive ? archived_tasks : tasks;

        // Применяем фильтр по категории
        if (window.currentCategory) {
            filteredTasks = filteredTasks.filter(task => task.category === window.currentCategory);
        }

        // Применяем фильтр по дням (только для активных задач)
        if (!showArchive) {
            const daysFilterValue = parseInt(document.getElementById('daysFilter').value) || 0;
            const now = new Date();

            filteredTasks = filteredTasks.filter(task => {
                // Задачи без даты показываем всегда
                if (!task.datetime) return true;

                const taskDate = new Date(task.datetime);

                // Если фильтр = 0, показываем все задачи (включая просроченные)
                if (daysFilterValue === 0) return true;

                // Показываем задачи на ближайшие N дней и просроченные за последние N дней
                const diffDays = Math.ceil((taskDate - now) / (1000 * 60 * 60 * 24));
                return diffDays <= daysFilterValue && diffDays >= -daysFilterValue;
            });
        }

        // Сортировка задач
        filteredTasks.sort((a, b) => {
            // Сначала невыполненные, затем выполненные
            if (a.completed !== b.completed) return a.completed ? 1 : -1;

            // Задачи без даты в конце
            if (!a.datetime && !b.datetime) return 0;
            if (!a.datetime) return 1;
            if (!b.datetime) return -1;

            // Сортировка по дате (сначала ближайшие)
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

            const contact = task.chat_id ? window.users?.find(u => u.chat_id === task.chat_id) : null;
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

            return `<li class="flex items-center justify-between p-3 rounded-lg shadow ${task.completed ? 'bg-gray-200' : ''} ${task.repeat_interval ? 'repeating-task' : ''}" 
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
                </ul>` : ''}
        </li>`;
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
            document.querySelectorAll('.open-task').forEach(div => {
                console.log('Добавлен слушатель для задачи:', div.dataset.id);
                div.addEventListener('click', async () => {
                    console.log('Клик по задаче:', div.dataset.id);
                    const id = parseInt(div.dataset.id);
                    const task = window.tasks.find(t => t.id === id);
                    if (!task) {
                        console.error('Задача не найдена:', id);
                        alert('Задача не найдена');
                        return;
                    }
                    console.log('Найдена задача:', task);
                    window.currentEditId = id;
                    const editModal = document.getElementById('editModal');
                    if (!editModal) {
                        console.error('Модальное окно editModal не найдено');
                        alert('Ошибка: модальное окно не найдено');
                        return;
                    }
                    document.getElementById('editTaskText').value = task.text || '';
                    document.getElementById('editTaskDateTime').value = task.datetime || '';
                    document.getElementById('editTaskReminderTime').value = task.reminder_time || '';
                    document.getElementById('editTaskDescription').value = task.description || '';
                    const categorySelect = document.getElementById('editTaskCategory');
                    categorySelect.innerHTML = window.categories.map(cat => `<option value="${cat.name}" ${cat.name === task.category ? 'selected' : ''}>${cat.name}</option>`).join('');
                    const contactSelect = document.getElementById('editTaskContact');
                    await fetchUsers();
                    contactSelect.innerHTML = `<option value="">Без контакта</option>` + (window.users || []).map(user => `<option value="${user.chat_id}" ${user.chat_id === task.chat_id ? 'selected' : ''}>${user.name} (${user.username})</option>`).join('');
                    const editTaskGroup = document.getElementById('editTaskGroup');
                    const groups = [...new Set(window.users.map(user => user.group).filter(group => group))];
                    editTaskGroup.innerHTML = `<option value="">Без группы</option>` +
                        groups.map(group => `<option value="${group}" ${group === task.group ? 'selected' : ''}>${group}</option>`).join('');
                    const editTaskParent = document.getElementById('editTaskParent');
                    const parentOptions = window.tasks
                        .filter(t => (t.parent_id === null || t.parent_id === undefined) && t.id !== id)
                        .map(t => `<option value="${t.id}" ${t.id === task.parent_id ? 'selected' : ''}>${t.text}</option>`).join('');
                    editTaskParent.innerHTML = '<option value="">Без родительской задачи</option>' + parentOptions;
                    await updateTaskFilesList(id);
                    editModal.classList.remove('hidden');
                    console.log('Модальное окно открыто');
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
                        <option value="${cat.name}" ${cat.name === task.category ? 'selected' : ''}>${cat.name}</option>`).join('');
                        const contactSelect = document.getElementById('editTaskContact');
                        await fetchUsers();
                        contactSelect.innerHTML = `<option value="">Без контакта</option>` + users.map(user => `
                        <option value="${user.chat_id}" ${user.chat_id === task.chat_id ? 'selected' : ''}>${user.name} (${user.username})</option>`).join('');
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

window.renderTasks = renderTasks; // Добавляем renderTasks в window для доступа из categories.js

async function addTask() {
    const taskText = document.getElementById('taskInput').value.trim();
    if (!taskText) {
        alert('Введите текст задачи');
        return;
    }

    const taskData = {
        text: taskText,
        datetime: document.getElementById('taskDateTime').value || null,
        category: document.getElementById('taskCategory').value || null,
        description: document.getElementById('taskDescription').value || ''
    };

    console.log('Добавляем задачу:', taskData); // Отладка

    try {
        const response = await fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(taskData)
        });

        if (!response.ok) throw new Error('Ошибка при добавлении задачи');

        document.getElementById('taskInput').value = '';
        document.getElementById('taskDateTime').value = '';
        document.getElementById('taskCategory').value = ''; // Сбрасываем категорию
        document.getElementById('taskDescription').value = '';

        await renderTasks();
        await updateTaskStats();
    } catch (error) {
        console.error('Ошибка при добавлении задачи:', error);
        alert(`Не удалось добавить задачу: ${error.message}`);
    }
}

async function toggleTaskCompletion(e) {
    const taskId = e.target.closest('.task-item').dataset.id;
    const completed = e.target.checked;

    try {
        const response = await fetch(`/api/tasks/${taskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed })
        });

        if (!response.ok) throw new Error('Ошибка при обновлении задачи');
        await renderTasks();
        await updateTaskStats();
    } catch (error) {
        console.error('Ошибка при обновлении задачи:', error);
        e.target.checked = !completed;
    }
}

async function deleteTask(e) {
    const taskId = e.target.closest('.task-item').dataset.id;
    if (!confirm('Вы уверены, что хотите удалить эту задачу?')) return;

    try {
        const endpoint = showArchive ? `/api/archive/${taskId}` : `/api/tasks/${taskId}`;
        const response = await fetch(endpoint, { method: 'DELETE' });

        if (!response.ok) throw new Error('Ошибка при удалении задачи');
        await renderTasks();
        await updateTaskStats();
    } catch (error) {
        console.error('Ошибка при удалении задачи:', error);
        alert('Не удалось удалить задачу');
    }
}

async function openTaskModal(e) {
    const taskId = e.target.closest('.task-item').dataset.id;
    const task = [...window.tasks, ...window.archivedTasks].find(t => t.id == taskId);
    if (!task) return;

    window.currentEditId = task.id;

    // Заполнение модального окна
    document.getElementById('editTaskText').value = task.text || '';
    document.getElementById('editTaskDateTime').value = task.datetime || '';
    document.getElementById('editTaskDescription').value = task.description || '';

    // Показ модального окна
    document.getElementById('editModal').classList.remove('hidden');
}

async function toggleArchive() {
    showArchive = !showArchive;
    document.getElementById('toggleArchiveBtn').textContent =
        showArchive ? 'Показать активные' : 'Показать архив';
    await renderTasks();
}

async function archiveCompletedTasks() {
    if (!confirm('Архивировать все выполненные задачи?')) return;

    try {
        const response = await fetch('/api/archive', { method: 'POST' });
        if (!response.ok) throw new Error('Ошибка при архивировании задач');
        await fetchTasks();
        await renderTasks();
        await updateTaskStats();
    } catch (error) {
        console.error('Ошибка при архивировании задач:', error);
        alert('Не удалось архивировать задачи');
    }
}

async function searchTasks() {
    const searchTerm = document.getElementById('searchInput').value.trim().toLowerCase();
    const taskItems = document.querySelectorAll('.task-item');

    taskItems.forEach(item => {
        const taskId = item.dataset.id;
        const task = [...window.tasks, ...window.archivedTasks].find(t => t.id == taskId);
        if (!task) return;

        const text = item.textContent.toLowerCase();
        const matchesSearch = searchTerm ? text.includes(searchTerm) : true;
        const matchesCategory = window.currentCategory ? task.category === window.currentCategory : true;

        item.style.display = matchesSearch && matchesCategory ? '' : 'none';
    });

    console.log('Задачи после фильтрации поиска:', Array.from(taskItems).map(item => ({
        id: item.dataset.id,
        display: item.style.display
    }))); // Отладка
}

async function updateTaskStats() {
    try {
        const totalEl = document.getElementById('totalTasksCount');
        const completedEl = document.getElementById('completedTasksCount');
        const progressEl = document.getElementById('progressBarFill');

        // Если элементов нет (например, в разделе Контакты) - просто выходим
        if (!totalEl || !completedEl || !progressEl) return;

        const response = await fetch('/api/tasks/stats');
        if (response.ok) {
            const stats = await response.json();
            totalEl.textContent = stats.total || 0;
            completedEl.textContent = stats.completed || 0;

            const progress = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
            progressEl.style.width = `${progress}%`;
        }
    } catch (error) {
        console.error('Ошибка при загрузке статистики:', error);
    }
}

async function checkRepeatingTasks() {
    try {
        const response = await fetch('/api/tasks/process_repeating', { method: 'POST' });
        if (response.ok && (await response.json()).created > 0) {
            await fetchTasks();
            await renderTasks();
        }
    } catch (error) {
        console.error('Ошибка при проверке повторяющихся задач:', error);
    }
}

function applyDaysFilter() {
    const value = parseInt(document.getElementById('daysFilter').value);
    if (!isNaN(value)) {
        window.daysFilter = value;
        localStorage.setItem('daysFilter', window.daysFilter);
        renderTasks();
    }
}

function resetFilters() {
    window.currentCategory = null;
    window.daysFilter = 0;
    document.getElementById('daysFilter').value = window.daysFilter;
    localStorage.setItem('daysFilter', window.daysFilter);
    renderTasks();
}

function toggleAdvancedFields() {
    const advancedFields = document.getElementById('advancedFields');
    advancedFields.classList.toggle('hidden');
    const btn = document.getElementById('showAdvancedBtn');
    btn.textContent = advancedFields.classList.contains('hidden') ? 'Дополнительно' : 'Скрыть';
}

function showQuickAddModal() {
    document.getElementById('quickAddModal').classList.remove('hidden');
    document.getElementById('quickAddTextarea').focus();
}

async function addMultipleTasks() {
    const text = document.getElementById('quickAddTextarea').value.trim();
    if (!text) {
        alert('Введите текст задач');
        return;
    }

    const tasks = text.split('\n').filter(line => line.trim());
    let successCount = 0;

    for (const taskText of tasks) {
        try {
            const response = await fetch('/api/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: taskText })
            });
            if (response.ok) successCount++;
        } catch (error) {
            console.error('Ошибка при добавлении задачи:', error);
        }
    }

    document.getElementById('quickAddTextarea').value = '';
    document.getElementById('quickAddModal').classList.add('hidden');

    if (successCount > 0) {
        await fetchTasks();
        await renderTasks();
        alert(`Добавлено ${successCount} из ${tasks.length} задач`);
    }
}

function toggleSortOptions(e) {
    const sortOptions = document.getElementById('sortOptions');
    sortOptions.classList.toggle('hidden');
    e.stopPropagation();
}