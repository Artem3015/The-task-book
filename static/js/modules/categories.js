import { escapeRegExp } from './utils.js';

export async function initializeCategories() {
    await fetchCategories();
    renderCategories();
    setupCategoryEventListeners();
    setupDragAndDrop();
}

// Получение категорий с сервера
async function fetchCategories() {
    try {
        const response = await fetch('/api/categories', { timeout: 5000 });
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        window.categories = await response.json();
        return window.categories;
    } catch (error) {
        console.error('Ошибка загрузки категорий:', error);
        alert('Не удалось загрузить категории. Проверьте подключение к серверу.');
        return [];
    }
}

// Отрисовка списка категорий
function renderCategories() {
    const categoryList = document.getElementById('categoryList');
    if (!categoryList) return;

    categoryList.innerHTML = window.categories.map(category => `
        <li draggable="true" class="category-item" 
            style="background-color: ${category.color || '#e5e7eb'}" 
            data-category="${category.name}">
            <span class="category-name">${category.name}</span>
            <div class="category-actions">
                <button class="edit-category" data-category="${category.name}">✏️</button>
                <button class="delete-category" data-category="${category.name}">✕</button>
            </div>
        </li>
    `).join('');

    // Добавляем текущую активную категорию, если есть
    if (window.currentCategory) {
        const activeItem = categoryList.querySelector(`[data-category="${window.currentCategory}"]`);
        if (activeItem) {
            activeItem.classList.add('active-category');
        }
    }
}

// Настройка обработчиков событий
function setupCategoryEventListeners() {
    // Добавление категории
    const addCategoryBtn = document.getElementById('addCategoryBtn');
    if (addCategoryBtn) {
        addCategoryBtn.addEventListener('click', addCategory);
    }

    // Обработка событий для списка категорий
    const categoryList = document.getElementById('categoryList');
    if (categoryList) {
        // Используем делегирование событий для кнопок редактирования и удаления
        categoryList.addEventListener('click', (e) => {
            const categoryItem = e.target.closest('.category-item');
            if (!categoryItem) return;

            const editBtn = e.target.closest('.edit-category');
            const deleteBtn = e.target.closest('.delete-category');

            if (editBtn) {
                e.stopPropagation();
                openEditCategoryModal(editBtn.dataset.category);
            } else if (deleteBtn) {
                e.stopPropagation();
                deleteCategory(deleteBtn.dataset.category);
            } else {
                // Клик по самому элементу категории
                const category = categoryItem.dataset.category;
                filterTasksByCategory(category);
            }
        });
    }

    // Обработка нажатия Enter в поле ввода
    const categoryInput = document.getElementById('categoryInput');
    if (categoryInput) {
        categoryInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                addCategory();
            }
        });
    }
}

// Добавление новой категории
async function addCategory() {
    const categoryInput = document.getElementById('categoryInput');
    const categoryColor = document.getElementById('categoryColor');
    const categoryText = categoryInput.value.trim();
    const color = categoryColor?.value || '#e5e7eb';

    if (!categoryText) {
        alert('Введите название категории');
        return;
    }

    try {
        const response = await fetch('/api/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                name: categoryText,
                color: color
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Ошибка при добавлении категории');
        }

        // Сброс полей формы
        categoryInput.value = '';
        if (categoryColor) categoryColor.value = '#e5e7eb';

        // Обновление списка категорий
        await fetchCategories();
        renderCategories();
    } catch (error) {
        console.error('Ошибка при добавлении категории:', error);
        alert(`Не удалось добавить категорию: ${error.message}`);
    }
}

// Удаление категории
async function deleteCategory(categoryName) {
    if (!confirm(`Вы уверены, что хотите удалить категорию "${categoryName}"?`)) return;

    try {
        const response = await fetch(`/api/categories/${encodeURIComponent(categoryName)}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Ошибка при удалении категории');
        }

        // Если удаляемая категория была текущей, сбрасываем фильтр
        if (window.currentCategory === categoryName) {
            window.currentCategory = null;
        }

        // Обновление списка категорий и задач
        await fetchCategories();
        renderCategories();
        await window.renderTasks();
    } catch (error) {
        console.error('Ошибка при удалении категории:', error);
        alert(`Не удалось удалить категорию: ${error.message}`);
    }
}

function ensureEditCategoryModal() {
    let modal = document.getElementById('editCategoryModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'editCategoryModal';
        modal.className = 'modal hidden';
        modal.innerHTML = `
            <div class="modal-content">
                <h3>Редактировать категорию</h3>
                <input type="text" id="editCategoryName" placeholder="Название категории" required>
                <input type="color" id="editCategoryColor" value="#e5e7eb">
                <div class="modal-actions">
                    <button id="saveCategoryEditBtn">Сохранить</button>
                    <button id="cancelCategoryEditBtn">Отмена</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
}

// Открытие модального окна редактирования категории
function openEditCategoryModal(categoryName) {
    const category = window.categories.find(c => c.name === categoryName);
    if (!category) {
        console.error(`Категория "${categoryName}" не найдена`);
        return;
    }

    // Гарантируем наличие модального окна
    ensureEditCategoryModal();

    const editCategoryName = document.getElementById('editCategoryName');
    const editCategoryColor = document.getElementById('editCategoryColor');
    const saveCategoryEditBtn = document.getElementById('saveCategoryEditBtn');
    const cancelCategoryEditBtn = document.getElementById('cancelCategoryEditBtn');
    const editCategoryModal = document.getElementById('editCategoryModal');

    window.currentEditCategory = categoryName;

    editCategoryName.value = category.name;
    editCategoryColor.value = category.color || '#e5e7eb';

    saveCategoryEditBtn.onclick = saveCategoryChanges;
    cancelCategoryEditBtn.onclick = closeEditCategoryModal;

    editCategoryModal.classList.remove('hidden');
}

// Сохранение изменений категории
async function saveCategoryChanges() {
    if (!window.currentEditCategory) return;

    const newName = document.getElementById('editCategoryName').value.trim();
    const newColor = document.getElementById('editCategoryColor').value;

    if (!newName) {
        alert('Введите название категории');
        return;
    }

    try {
        const response = await fetch(`/api/categories/${encodeURIComponent(window.currentEditCategory)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                name: newName,
                color: newColor
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Ошибка при обновлении категории');
        }

        // Если переименовывали текущую категорию, обновляем фильтр
        if (window.currentCategory === window.currentEditCategory) {
            window.currentCategory = newName;
        }

        closeEditCategoryModal();
        await fetchCategories();
        renderCategories();
        await window.renderTasks();
    } catch (error) {
        console.error('Ошибка при обновлении категории:', error);
        alert(`Не удалось обновить категорию: ${error.message}`);
    }
}

// Закрытие модального окна редактирования
function closeEditCategoryModal() {
    document.getElementById('editCategoryModal').classList.add('hidden');
    window.currentEditCategory = null;
}

// Фильтрация задач по категории
async function filterTasksByCategory(category) {
    window.currentCategory = category === window.currentCategory ? null : category;
    renderCategories(); // Чтобы обновить выделение активной категории
    await window.renderTasks();
}

// Настройка drag-and-drop для категорий
function setupDragAndDrop() {
    const categoryList = document.getElementById('categoryList');
    if (!categoryList) return;

    // Начало перетаскивания
    document.querySelectorAll('.category-item').forEach(item => {
        item.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', item.dataset.category);
            item.classList.add('dragging');
        });
        
        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
        });
    });

    // Разрешаем сброс
    categoryList.addEventListener('dragover', (e) => {
        e.preventDefault();
    });

    // Обработка сброса
    categoryList.addEventListener('drop', async (e) => {
        e.preventDefault();
        const categoryName = e.dataTransfer.getData('text/plain');
        const category = window.categories.find(c => c.name === categoryName);
        
        if (category) {
            window.currentCategory = categoryName;
            renderCategories();
            await window.renderTasks();
        }
    });
}

// Получение цвета категории
export function getCategoryColor(categoryName) {
    const category = window.categories.find(c => c.name === categoryName);
    return category ? category.color || '#e5e7eb' : '#e5e7eb';
}