import { debounce, throttle } from './utils.js';

export function initializeUI() {
    setupModalHandlers();
    setupNavigation();
    setupTooltips();
    setupResponsiveElements();
    setupThemeSwitcher();
    setupNotificationHandlers();
    setupFormValidators();
    setupLoadingIndicators();
    setupGlobalEventListeners();
}

// Обработчики модальных окон
function setupModalHandlers() {
    // Закрытие модальных окон по клику вне области
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
            }
        });
    });

    // Обработчики для всех кнопок закрытия
    document.querySelectorAll('[data-modal-close]').forEach(btn => {
        const modalId = btn.dataset.modalClose;
        btn.addEventListener('click', () => {
            document.getElementById(modalId)?.classList.add('hidden');
        });
    });

    // Обработчики для всех кнопок открытия
    document.querySelectorAll('[data-modal-open]').forEach(btn => {
        const modalId = btn.dataset.modalOpen;
        btn.addEventListener('click', () => {
            document.getElementById(modalId)?.classList.remove('hidden');
        });
    });
}

// Навигация и роутинг
function setupNavigation() {
    // Обработка кликов по навигационным ссылкам
    document.querySelectorAll('nav a').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            history.pushState(null, null, e.target.href);
            window.handleRouting();
        });
    });

    // Обработка событий истории браузера
    window.addEventListener('popstate', window.handleRouting);
}

// Инициализация тултипов
function setupTooltips() {
    const tooltips = document.querySelectorAll('[data-tooltip]');
    
    tooltips.forEach(element => {
        const tooltipText = element.dataset.tooltip;
        const tooltip = document.createElement('div');
        tooltip.className = 'tooltip';
        tooltip.textContent = tooltipText;
        document.body.appendChild(tooltip);

        const positionTooltip = () => {
            const rect = element.getBoundingClientRect();
            tooltip.style.left = `${rect.left + rect.width / 2 - tooltip.offsetWidth / 2}px`;
            tooltip.style.top = `${rect.top - tooltip.offsetHeight - 5}px`;
        };

        element.addEventListener('mouseenter', () => {
            tooltip.classList.add('visible');
            positionTooltip();
        });

        element.addEventListener('mouseleave', () => {
            tooltip.classList.remove('visible');
        });

        // Обновление позиции при изменении размера окна
        window.addEventListener('resize', throttle(positionTooltip, 100));
    });
}

// Адаптивные элементы
function setupResponsiveElements() {
    function handleResize() {
        // Переключение видимости элементов в зависимости от размера экрана
        const mobileElements = document.querySelectorAll('[data-mobile-only]');
        const desktopElements = document.querySelectorAll('[data-desktop-only]');
        
        const isMobile = window.innerWidth < 768;
        
        mobileElements.forEach(el => {
            el.style.display = isMobile ? '' : 'none';
        });
        
        desktopElements.forEach(el => {
            el.style.display = isMobile ? 'none' : '';
        });
    }

    // Первоначальная настройка и обработка ресайза
    handleResize();
    window.addEventListener('resize', debounce(handleResize, 200));
}

// Переключатель темы
function setupThemeSwitcher() {
    const themeSwitcher = document.getElementById('themeSwitcher');
    if (!themeSwitcher) return;

    // Проверка сохраненной темы или системных предпочтений
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme === 'dark' || (!savedTheme && systemPrefersDark)) {
        document.documentElement.classList.add('dark-theme');
        themeSwitcher.checked = true;
    }

    // Обработка переключения темы
    themeSwitcher.addEventListener('change', (e) => {
        if (e.target.checked) {
            document.documentElement.classList.add('dark-theme');
            localStorage.setItem('theme', 'dark');
        } else {
            document.documentElement.classList.remove('dark-theme');
            localStorage.setItem('theme', 'light');
        }
    });
}

// Обработчики уведомлений
function setupNotificationHandlers() {
    window.showNotification = (message, type = 'info', duration = 3000) => {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);
        
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, duration);
    };
}

// Валидация форм
function setupFormValidators() {
    document.querySelectorAll('[data-validate]').forEach(form => {
        form.addEventListener('submit', (e) => {
            let isValid = true;
            
            form.querySelectorAll('[required]').forEach(input => {
                if (!input.value.trim()) {
                    input.classList.add('invalid');
                    isValid = false;
                } else {
                    input.classList.remove('invalid');
                }
            });
            
            if (!isValid) {
                e.preventDefault();
                window.showNotification('Заполните все обязательные поля', 'error');
            }
        });
        
        // Сброс валидации при вводе
        form.querySelectorAll('input, textarea').forEach(input => {
            input.addEventListener('input', () => {
                input.classList.remove('invalid');
            });
        });
    });
}

// Индикаторы загрузки
function setupLoadingIndicators() {
    window.showLoading = (selector = 'body') => {
        const container = document.querySelector(selector);
        if (!container) return;
        
        const loader = document.createElement('div');
        loader.className = 'loading-overlay';
        loader.innerHTML = '<div class="spinner"></div>';
        container.appendChild(loader);
    };
    
    window.hideLoading = (selector = 'body') => {
        const container = document.querySelector(selector);
        if (!container) return;
        
        const loader = container.querySelector('.loading-overlay');
        if (loader) loader.remove();
    };
}

// Глобальные обработчики событий
function setupGlobalEventListeners() {
    // Закрытие выпадающих меню по клику вне их области
    document.addEventListener('click', (e) => {
        document.querySelectorAll('.dropdown.open').forEach(dropdown => {
            if (!dropdown.contains(e.target)) {
                dropdown.classList.remove('open');
            }
        });
    });
    
    // Обработчики для всех выпадающих меню
    document.querySelectorAll('.dropdown-toggle').forEach(toggle => {
        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const dropdown = e.target.closest('.dropdown');
            dropdown?.classList.toggle('open');
        });
    });
    
    // Плавная прокрутка для якорей
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            const targetElement = document.querySelector(targetId);
            
            if (targetElement) {
                targetElement.scrollIntoView({
                    behavior: 'smooth'
                });
            }
        });
    });
}

// Вспомогательные UI-функции
export function toggleElementVisibility(selector, force) {
    const element = document.querySelector(selector);
    if (!element) return;
    
    if (typeof force === 'boolean') {
        force ? element.classList.remove('hidden') : element.classList.add('hidden');
    } else {
        element.classList.toggle('hidden');
    }
}

export function disableElements(selectors, disable = true) {
    selectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
            el.disabled = disable;
        });
    });
}

export function updateCounter(selector, count) {
    const element = document.querySelector(selector);
    if (element) {
        element.textContent = count;
        element.classList.toggle('hidden', count === 0);
    }
}