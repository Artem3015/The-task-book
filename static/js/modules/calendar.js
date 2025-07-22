import { formatDateTime } from './utils.js';

export function initializeCalendar() {
    if (document.getElementById('calendarContainer')) {
        renderCalendar();
        setupCalendarEventListeners();
    }
}

// Отрисовка календаря
async function renderCalendar() {
    try {
        const response = await fetch('/api/tasks');
        if (!response.ok) throw new Error('Ошибка загрузки задач');
        const data = await response.json();

        const today = new Date();
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();

        // Получаем первый день месяца и количество дней в месяце
        const firstDay = new Date(currentYear, currentMonth, 1).getDay();
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

        // Корректировка для отображения (понедельник - первый день)
        const startDay = firstDay === 0 ? 6 : firstDay - 1;

        // Генерация календаря
        let calendarHTML = `
            <div class="calendar-header">
                <h2>${getMonthName(currentMonth)} ${currentYear}</h2>
                <div class="calendar-nav">
                    <button id="prevMonthBtn">&lt;</button>
                    <button id="todayBtn">Сегодня</button>
                    <button id="nextMonthBtn">&gt;</button>
                </div>
            </div>
            <div class="calendar-grid">
                <div class="calendar-weekdays">
                    ${['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(day => `
                        <div>${day}</div>
                    `).join('')}
                </div>
                <div class="calendar-days">
        `;

        // Пустые ячейки для дней предыдущего месяца
        for (let i = 0; i < startDay; i++) {
            calendarHTML += `<div class="calendar-day other-month"></div>`;
        }

        // Ячейки текущего месяца
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayTasks = data.tasks.filter(task => 
                task.datetime && task.datetime.startsWith(dateStr)
            );

            const isToday = today.getDate() === day && 
                           today.getMonth() === currentMonth && 
                           today.getFullYear() === currentYear;

            calendarHTML += `
                <div class="calendar-day ${isToday ? 'today' : ''}" data-date="${dateStr}">
                    <div class="day-number">${day}</div>
                    ${dayTasks.slice(0, 3).map(task => `
                        <div class="calendar-task" data-taskid="${task.id}">
                            <span class="task-time">${formatDateTime(task.datetime).split(',')[1]?.trim() || ''}</span>
                            <span class="task-text">${task.text}</span>
                        </div>
                    `).join('')}
                    ${dayTasks.length > 3 ? `<div class="more-tasks">+${dayTasks.length - 3} еще</div>` : ''}
                </div>
            `;
        }

        // Завершение HTML
        calendarHTML += `
                </div>
            </div>
            <div class="calendar-legend">
                <div><span class="legend-color today"></span> Сегодня</div>
                <div><span class="legend-color has-tasks"></span> Есть задачи</div>
            </div>
        `;

        document.getElementById('calendarContainer').innerHTML = calendarHTML;
    } catch (error) {
        console.error('Ошибка при отображении календаря:', error);
        document.getElementById('calendarContainer').innerHTML = `
            <div class="calendar-error">
                Не удалось загрузить календарь. Пожалуйста, попробуйте позже.
            </div>
        `;
    }
}

// Настройка обработчиков событий
function setupCalendarEventListeners() {
    // Навигация по месяцам
    document.getElementById('prevMonthBtn')?.addEventListener('click', () => {
        window.calendarMonth = (window.calendarMonth === 0) ? 11 : window.calendarMonth - 1;
        if (window.calendarMonth === 11) window.calendarYear--;
        renderCalendar();
    });

    document.getElementById('nextMonthBtn')?.addEventListener('click', () => {
        window.calendarMonth = (window.calendarMonth === 11) ? 0 : window.calendarMonth + 1;
        if (window.calendarMonth === 0) window.calendarYear++;
        renderCalendar();
    });

    document.getElementById('todayBtn')?.addEventListener('click', () => {
        const today = new Date();
        window.calendarMonth = today.getMonth();
        window.calendarYear = today.getFullYear();
        renderCalendar();
    });

    // Клик по дню
    document.addEventListener('click', (e) => {
        const dayElement = e.target.closest('.calendar-day');
        if (dayElement && dayElement.dataset.date) {
            openDayModal(dayElement.dataset.date);
        }

        const taskElement = e.target.closest('.calendar-task');
        if (taskElement && taskElement.dataset.taskid) {
            openTaskModal(taskElement.dataset.taskid);
        }
    });
}

// Открытие модального окна дня
async function openDayModal(dateStr) {
    try {
        const response = await fetch(`/api/tasks?date=${dateStr}`);
        if (!response.ok) throw new Error('Ошибка загрузки задач');
        const tasks = await response.json();

        const date = new Date(dateStr);
        const modalTitle = `${date.getDate()} ${getMonthName(date.getMonth())} ${date.getFullYear()}`;

        const modalHTML = `
            <h3>Задачи на ${modalTitle}</h3>
            <div class="day-tasks">
                ${tasks.length > 0 ? 
                    tasks.map(task => `
                        <div class="day-task" data-taskid="${task.id}">
                            <div class="task-time">${formatDateTime(task.datetime).split(',')[1]?.trim() || ''}</div>
                            <div class="task-text">${task.text}</div>
                        </div>
                    `).join('') : 
                    '<p>Нет задач на этот день</p>'
                }
            </div>
            <button id="addTaskToDay" data-date="${dateStr}">Добавить задачу</button>
        `;

        document.getElementById('calendarModalContent').innerHTML = modalHTML;
        document.getElementById('calendarModal').classList.remove('hidden');

        // Обработчик для кнопки добавления задачи
        document.getElementById('addTaskToDay')?.addEventListener('click', () => {
            openAddTaskModal(dateStr);
        });

        // Обработчики для задач в модальном окне
        document.querySelectorAll('.day-task').forEach(task => {
            task.addEventListener('click', () => {
                openTaskModal(task.dataset.taskid);
            });
        });

    } catch (error) {
        console.error('Ошибка при открытии дня:', error);
        alert('Не удалось загрузить задачи для этого дня');
    }
}

// Открытие модального окна задачи
async function openTaskModal(taskId) {
    try {
        const response = await fetch(`/api/tasks/${taskId}`);
        if (!response.ok) throw new Error('Ошибка загрузки задачи');
        const task = await response.json();

        const modalHTML = `
            <h3>${task.text}</h3>
            <div class="task-details">
                ${task.datetime ? `<div><strong>Дата:</strong> ${formatDateTime(task.datetime)}</div>` : ''}
                ${task.category ? `<div><strong>Категория:</strong> ${task.category}</div>` : ''}
                ${task.description ? `<div><strong>Описание:</strong> ${task.description}</div>` : ''}
            </div>
            <div class="task-actions">
                <button id="editCalendarTask" data-taskid="${task.id}">Редактировать</button>
                <button id="deleteCalendarTask" data-taskid="${task.id}">Удалить</button>
            </div>
        `;

        document.getElementById('calendarModalContent').innerHTML = modalHTML;
        document.getElementById('calendarModal').classList.remove('hidden');

        // Обработчики действий
        document.getElementById('editCalendarTask')?.addEventListener('click', () => {
            window.openEditModal(task);
            closeCalendarModal();
        });

        document.getElementById('deleteCalendarTask')?.addEventListener('click', () => {
            deleteTaskFromCalendar(task.id);
        });

    } catch (error) {
        console.error('Ошибка при открытии задачи:', error);
        alert('Не удалось загрузить информацию о задаче');
    }
}

// Открытие модального окна добавления задачи
function openAddTaskModal(dateStr) {
    const date = new Date(dateStr);
    const defaultDate = `${dateStr}T09:00`;
    
    document.getElementById('taskDateTime').value = defaultDate;
    document.getElementById('addTaskModal').classList.remove('hidden');
    closeCalendarModal();
}

// Удаление задачи из календаря
async function deleteTaskFromCalendar(taskId) {
    if (!confirm('Вы уверены, что хотите удалить эту задачу?')) return;

    try {
        const response = await fetch(`/api/tasks/${taskId}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Ошибка при удалении задачи');

        closeCalendarModal();
        renderCalendar();
        // Обновляем список задач, если он есть на странице
        if (typeof window.renderTasks === 'function') {
            await window.renderTasks();
        }
    } catch (error) {
        console.error('Ошибка при удалении задачи:', error);
        alert('Не удалось удалить задачу');
    }
}

// Закрытие модального окна календаря
function closeCalendarModal() {
    document.getElementById('calendarModal').classList.add('hidden');
}

// Вспомогательная функция для получения названия месяца
function getMonthName(monthIndex) {
    const months = [
        'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
        'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
    ];
    return months[monthIndex];
}

// Инициализация глобальных переменных календаря
export function initCalendarGlobals() {
    const today = new Date();
    window.calendarMonth = today.getMonth();
    window.calendarYear = today.getFullYear();
}