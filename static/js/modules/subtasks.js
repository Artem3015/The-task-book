export async function initializeSubtasks() {
    // Инициализация обработчиков для работы с подзадачами
    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('.task-item').forEach(task => {
            task.addEventListener('click', handleTaskClick);
        });
    });
}

// Обработка клика по задаче для отображения подзадач
async function handleTaskClick(event) {
    const taskElement = event.currentTarget;
    const taskId = taskElement.dataset.id;
    
    // Проверяем, был ли клик по чекбоксу или кнопке удаления
    if (event.target.classList.contains('toggle-task') || 
        event.target.classList.contains('delete-task')) {
        return;
    }

    await renderSubtasks(taskId);
    toggleSubtasksVisibility(taskElement);
}

// Переключение видимости подзадач
function toggleSubtasksVisibility(taskElement) {
    const subtasksContainer = taskElement.querySelector('.subtasks-container');
    
    if (!subtasksContainer) {
        // Создаем контейнер для подзадач, если его нет
        const container = document.createElement('div');
        container.className = 'subtasks-container';
        taskElement.appendChild(container);
        return;
    }

    subtasksContainer.classList.toggle('hidden');
}

// Отрисовка подзадач
async function renderSubtasks(taskId) {
    const taskElement = document.querySelector(`.task-item[data-id="${taskId}"]`);
    if (!taskElement) return;

    let subtasksContainer = taskElement.querySelector('.subtasks-container');
    if (!subtasksContainer) {
        subtasksContainer = document.createElement('div');
        subtasksContainer.className = 'subtasks-container';
        taskElement.appendChild(subtasksContainer);
    }

    try {
        const response = await fetch(`/api/tasks/${taskId}/subtasks`);
        if (!response.ok) throw new Error('Ошибка загрузки подзадач');
        
        const subtasks = await response.json();
        subtasksContainer.innerHTML = generateSubtasksHTML(subtasks, taskId);
        
        setupSubtasksEventListeners(subtasksContainer, taskId);
    } catch (error) {
        console.error('Ошибка при загрузке подзадач:', error);
        subtasksContainer.innerHTML = '<div class="subtasks-error">Не удалось загрузить подзадачи</div>';
    }
}

// Генерация HTML для подзадач
function generateSubtasksHTML(subtasks, parentTaskId) {
    return `
        <div class="subtasks-header">
            <h4>Подзадачи</h4>
            <button class="add-subtask-btn" data-parent-id="${parentTaskId}">+ Добавить</button>
        </div>
        <ul class="subtasks-list">
            ${subtasks.length > 0 ? 
                subtasks.map(subtask => `
                    <li class="subtask-item" data-id="${subtask.id}">
                        <input type="checkbox" class="toggle-subtask" ${subtask.completed ? 'checked' : ''}>
                        <span class="subtask-text ${subtask.completed ? 'completed' : ''}">${subtask.text}</span>
                        <button class="edit-subtask">✏️</button>
                        <button class="delete-subtask">✕</button>
                    </li>
                `).join('') : 
                '<li class="no-subtasks">Нет подзадач</li>'
            }
        </ul>
        <div class="add-subtask-form hidden">
            <input type="text" class="subtask-input" placeholder="Текст подзадачи">
            <button class="save-subtask">Сохранить</button>
            <button class="cancel-subtask">Отмена</button>
        </div>
    `;
}

// Настройка обработчиков событий для подзадач
function setupSubtasksEventListeners(container, parentTaskId) {
    // Переключение статуса подзадачи
    container.querySelectorAll('.toggle-subtask').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => toggleSubtaskCompletion(e, parentTaskId));
    });

    // Удаление подзадачи
    container.querySelectorAll('.delete-subtask').forEach(btn => {
        btn.addEventListener('click', (e) => deleteSubtask(e, parentTaskId));
    });

    // Редактирование подзадачи
    container.querySelectorAll('.edit-subtask').forEach(btn => {
        btn.addEventListener('click', (e) => startEditSubtask(e));
    });

    // Добавление новой подзадачи
    container.querySelector('.add-subtask-btn')?.addEventListener('click', () => {
        showAddSubtaskForm(container);
    });

    // Сохранение новой подзадачи
    container.querySelector('.save-subtask')?.addEventListener('click', () => {
        saveNewSubtask(container, parentTaskId);
    });

    // Отмена добавления подзадачи
    container.querySelector('.cancel-subtask')?.addEventListener('click', () => {
        hideAddSubtaskForm(container);
    });
}

// Переключение статуса выполнения подзадачи
async function toggleSubtaskCompletion(event, parentTaskId) {
    const subtaskId = event.target.closest('.subtask-item').dataset.id;
    const completed = event.target.checked;

    try {
        const response = await fetch(`/api/tasks/${subtaskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed })
        });

        if (!response.ok) throw new Error('Ошибка при обновлении подзадачи');

        // Обновляем отображение
        const subtaskText = event.target.nextElementSibling;
        subtaskText.classList.toggle('completed', completed);
    } catch (error) {
        console.error('Ошибка при обновлении подзадачи:', error);
        event.target.checked = !completed;
    }
}

// Удаление подзадачи
async function deleteSubtask(event, parentTaskId) {
    const subtaskId = event.target.closest('.subtask-item').dataset.id;
    
    if (!confirm('Вы уверены, что хотите удалить эту подзадачу?')) return;

    try {
        const response = await fetch(`/api/tasks/${subtaskId}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Ошибка при удалении подзадачи');

        // Перерисовываем подзадачи
        await renderSubtasks(parentTaskId);
    } catch (error) {
        console.error('Ошибка при удалении подзадачи:', error);
        alert('Не удалось удалить подзадачу');
    }
}

// Начало редактирования подзадачи
function startEditSubtask(event) {
    const subtaskItem = event.target.closest('.subtask-item');
    const subtaskText = subtaskItem.querySelector('.subtask-text').textContent;
    const subtaskId = subtaskItem.dataset.id;

    subtaskItem.innerHTML = `
        <input type="text" class="edit-subtask-input" value="${subtaskText}">
        <button class="save-edit-subtask">✓</button>
        <button class="cancel-edit-subtask">✕</button>
    `;

    // Фокус на поле ввода
    const input = subtaskItem.querySelector('.edit-subtask-input');
    input.focus();
    input.setSelectionRange(0, input.value.length);

    // Обработчики для кнопок
    subtaskItem.querySelector('.save-edit-subtask').addEventListener('click', () => {
        saveEditedSubtask(subtaskItem, subtaskId);
    });

    subtaskItem.querySelector('.cancel-edit-subtask').addEventListener('click', () => {
        renderSubtasks(subtaskItem.closest('.task-item').dataset.id);
    });
}

// Сохранение изменений подзадачи
async function saveEditedSubtask(subtaskItem, subtaskId) {
    const newText = subtaskItem.querySelector('.edit-subtask-input').value.trim();
    
    if (!newText) {
        alert('Текст подзадачи не может быть пустым');
        return;
    }

    try {
        const response = await fetch(`/api/tasks/${subtaskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: newText })
        });

        if (!response.ok) throw new Error('Ошибка при сохранении подзадачи');

        // Перерисовываем подзадачи
        const parentTaskId = subtaskItem.closest('.task-item').dataset.id;
        await renderSubtasks(parentTaskId);
    } catch (error) {
        console.error('Ошибка при сохранении подзадачи:', error);
        alert('Не удалось сохранить изменения');
    }
}

// Показать форму добавления подзадачи
function showAddSubtaskForm(container) {
    container.querySelector('.add-subtask-form').classList.remove('hidden');
    container.querySelector('.add-subtask-btn').classList.add('hidden');
    container.querySelector('.subtask-input').focus();
}

// Скрыть форму добавления подзадачи
function hideAddSubtaskForm(container) {
    container.querySelector('.add-subtask-form').classList.add('hidden');
    container.querySelector('.add-subtask-btn').classList.remove('hidden');
    container.querySelector('.subtask-input').value = '';
}

// Сохранение новой подзадачи
async function saveNewSubtask(container, parentTaskId) {
    const input = container.querySelector('.subtask-input');
    const text = input.value.trim();
    
    if (!text) {
        alert('Введите текст подзадачи');
        return;
    }

    try {
        const response = await fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: text,
                parent_id: parentTaskId
            })
        });

        if (!response.ok) throw new Error('Ошибка при добавлении подзадачи');

        // Скрываем форму и очищаем поле ввода
        hideAddSubtaskForm(container);
        
        // Перерисовываем подзадачи
        await renderSubtasks(parentTaskId);
    } catch (error) {
        console.error('Ошибка при добавлении подзадачи:', error);
        alert('Не удалось добавить подзадачу');
    }
}

// Экспортируем функцию для использования в других модулях
export async function handleSubtasks(taskId) {
    return renderSubtasks(taskId);
}