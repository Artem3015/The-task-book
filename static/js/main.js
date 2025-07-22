import { initializeSpeechRecognition } from './modules/speech-recognition.js';
import { initializeTasks } from './modules/tasks.js';
import { initializeCategories } from './modules/categories.js';
import { initializeContacts } from './modules/contacts.js';
import { initializeCalendar } from './modules/calendar.js';
import { initializeUI } from './modules/ui.js';

// Глобальные переменные с защитой от перезаписи
if (!window.taskManagerGlobals) {
    window.taskManagerGlobals = {
        currentCategory: null,
        showArchive: false, // Можно удалить, так как теперь в tasks.js
        currentEditId: null,
        categories: [],
        tasks: [] // users больше не нужен здесь
    };
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Сначала инициализируем UI (чтобы элементы DOM точно были доступны)
        await initializeUI();

        // Инициализируем модули только для соответствующих страниц
        const path = window.location.pathname;

        if (path === '/' || path === '/tasks') {
            //Загружаем категории(нужны для задач)
            await initializeCategories();
            //Инициализируем задачи (после категорий)
            await initializeTasks();
        }

        if (path === '/calendar') {
            await initializeCalendar();
        }

        if (path === '/contacts') {
            await initializeContacts();
        }

        // Общие модули
        await initializeSpeechRecognition();

    } catch (error) {
        console.error('Initialization error:', error);
    }
});