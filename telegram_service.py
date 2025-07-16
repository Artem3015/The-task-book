import requests
from datetime import datetime, timedelta
import time
import threading
import json
import os

class TelegramService:
    def __init__(self):
        print("Initializing TelegramService")
        
        config = self._load_config()
        self.bot_token = config.get('TELEGRAM_BOT_TOKEN')
        
        if not self.bot_token:
            raise ValueError("TELEGRAM_BOT_TOKEN не найден в конфигурационном файле")
        
        self.base_url = f'https://api.telegram.org/bot{self.bot_token}'
        self.tasks_file = 'tasks.json'
        self.requests_history_file = 'requests_history.json'
        self.is_running = False
        self.sent_reminders = set()
        self.updates_thread = None

        if not os.path.exists(self.requests_history_file):
            with open(self.requests_history_file, 'w', encoding='utf-8') as f:
                json.dump([], f)

    def get_user_tasks_for_week(self, chat_id):
        """Получает задачи пользователя на ближайшие 7 дней."""
        try:
            with open(self.tasks_file, 'r', encoding='utf-8') as f:
                tasks = json.load(f)
            
            now = datetime.now()
            week_later = now + timedelta(days=7)
            
            user_tasks = []
            for task in tasks:
                if not task.get('datetime') or task.get('completed'):
                    continue
                    
                task_time = datetime.fromisoformat(task['datetime'])
                if (task.get('chat_id') == chat_id or 
                    (task.get('group') and any(u['chat_id'] == chat_id and u.get('group') == task['group'] for u in self._get_users()))):
                    if now <= task_time <= week_later:
                        user_tasks.append(task)
            
            return user_tasks
        except Exception as e:
            print(f"Ошибка при получении задач пользователя: {e}")
            return []

    def _get_users(self):
        """Получает список пользователей из файла users.json."""
        try:
            with open('users.json', 'r', encoding='utf-8') as f:
                return json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            return []

    def _format_task_message(self, task):
        """Форматирует задачу для отправки в сообщении."""
        message = f"*Задача:* {task['text']}\n"
        if task.get('description'):
            message += f"*Описание:* {task['description']}\n"
        if task.get('category'):
            message += f"*Категория:* {task['category']}\n"
        if task.get('datetime'):
            task_time = datetime.fromisoformat(task['datetime'])
            message += f"*Время:* {task_time.strftime('%d.%m.%Y %H:%M')}\n"
        if task.get('reminder_time'):
            message += f"*Напоминание за:* {task['reminder_time']} мин.\n"
        if task.get('group'):
            message += f"*Группа:* {task['group']}\n"
        if task.get('files'):
            message += f"*Вложения:* {len(task['files'])} файлов\n"
        if task.get('repeat_interval'):
            intervals = {
                'day': 'Ежедневно',
                'week': 'Еженедельно',
                'month': 'Ежемесячно',
                'quarter': 'Ежеквартально',
                'year': 'Ежегодно'
            }
            message += f"*Повторение:* {intervals[task['repeat_interval']]}\n"
            if task.get('repeat_count'):
                message += f"*Количество повторений:* {task['repeat_count']}\n"
            if task.get('repeat_until'):
                message += f"*Повторять до:* {task['repeat_until']}\n"
        return message

    def check_reminders(self):
        print("Starting reminder checks")
        while True:
            try:
                with open(self.tasks_file, 'r', encoding='utf-8') as f:
                    tasks = json.load(f)
                
                current_time = datetime.now()
                
                for task in tasks:
                    task_id = task.get('id')
                    if (task.get('datetime') and task.get('chat_id') and not task.get('completed') 
                        and task.get('reminder_time') is not None and task_id not in self.sent_reminders):
                        task_time = datetime.fromisoformat(task['datetime'])
                        reminder_minutes = int(task['reminder_time'])
                        reminder_time = task_time - timedelta(minutes=reminder_minutes)
                        
                        if current_time >= reminder_time and current_time <= reminder_time + timedelta(minutes=1):
                            # Отправляем основное сообщение с информацией о задаче
                            message = "*Напоминание о задаче:*\n\n"
                            message += self._format_task_message(task)
                            self.send_message(task['chat_id'], message)
                            
                            # Если есть файлы, отправляем их
                            if task.get('files'):
                                for file_info in task['files']:
                                    try:
                                        file_path = os.path.join('task_files', file_info['path'])
                                        if os.path.exists(file_path):
                                            with open(file_path, 'rb') as file:
                                                url = f'{self.base_url}/sendDocument'
                                                files = {'document': (file_info['name'], file)}
                                                data = {'chat_id': task['chat_id']}
                                                response = requests.post(url, files=files, data=data)
                                                if response.status_code != 200:
                                                    print(f"Ошибка отправки файла: {response.text}")
                                    except Exception as e:
                                        print(f"Ошибка при отправке файла {file_info['name']}: {e}")
                            
                            self.sent_reminders.add(task_id)
                            print(f"Sent reminder for task {task_id}")
            
            except Exception as e:
                print(f"Ошибка при проверке напоминаний: {e}")
            
            time.sleep(60)

    def _load_config(self):
        config_path = os.getenv('CONFIG_PATH', os.path.join(os.path.dirname(__file__), 'config.json'))
        config_dir = os.path.dirname(config_path)
        
        if config_dir and not os.path.exists(config_dir):
            os.makedirs(config_dir, exist_ok=True)
        
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except FileNotFoundError:
            raise FileNotFoundError(f"Конфигурационный файл не найден: {config_path}")
        except json.JSONDecodeError:
            raise ValueError(f"Ошибка формата в файле конфигурации: {config_path}")

    def _log_request(self, chat_id, text, username=None, name=None):
        try:
            with open(self.requests_history_file, 'r', encoding='utf-8') as f:
                history = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            history = []

        # Проверяем, есть ли запись с таким chat_id
        for entry in history:
            if entry.get('chat_id') == chat_id:
                # Обновляем существующую запись
                entry.update({
                    'text': text,
                    'username': username or entry.get('username', ''),
                    'name': name or entry.get('name', str(chat_id)),
                    'timestamp': datetime.now().isoformat()
                })
                break
        else:
            # Если записи нет, добавляем новую
            history.append({
                'chat_id': chat_id,
                'text': text,
                'username': username,
                'name': name or str(chat_id),
                'timestamp': datetime.now().isoformat()
            })

        with open(self.requests_history_file, 'w', encoding='utf-8') as f:
            json.dump(history, f, indent=2)

    def send_message(self, chat_id, text):
        try:
            url = f'{self.base_url}/sendMessage'
            payload = {
                'chat_id': chat_id,
                'text': text,
                'parse_mode': 'Markdown'
            }
            response = requests.post(url, json=payload, timeout=10)
            if response.status_code != 200:
                print(f"Ошибка Telegram API: {response.status_code} - {response.text}")
                return None
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"Ошибка отправки сообщения в Telegram: {e}")
            return None

    def get_chat_id_by_username(self, username):
        """Получает chat_id и имя по username из истории, учитывая возможное отсутствие @."""
        try:
            with open(self.requests_history_file, 'r', encoding='utf-8') as f:
                history = json.load(f)
            # Удаляем @ из переданного username для поиска
            normalized_username = username.lstrip('@')
            for entry in history:
                if entry.get('username') and normalized_username == entry.get('username').lstrip('@'):
                    return {
                        'chat_id': entry['chat_id'],
                        'name': entry.get('name', username)
                    }
            
            print(f"Пользователь {username} не найден в истории взаимодействий")
            return None
        except Exception as e:
            print(f"Ошибка при получении chat_id: {e}")
            return None

    def handle_updates(self):
        if self.is_running:
            print("handle_updates уже запущен, пропускаем")
            return
        self.is_running = True
        print("Starting update handling")
        last_update_id = None
        while self.is_running:
            try:
                url = f'{self.base_url}/getUpdates'
                params = {'offset': last_update_id, 'timeout': 30}
                response = requests.get(url, params=params, timeout=40)
                if response.status_code != 200:
                    print(f"Ошибка Telegram API: {response.status_code} - {response.text}")
                    if response.status_code == 409:
                        print("Конфликт getUpdates, пытаемся очистить очередь")
                        last_update_id = None
                        time.sleep(5)
                        continue
                    continue
                updates = response.json().get('result', [])
                
                for update in updates:
                    last_update_id = update['update_id'] + 1
                    if 'message' in update and 'text' in update['message']:
                        chat_id = update['message']['chat']['id']
                        text = update['message']['text']
                        username = update['message']['chat'].get('username', '')
                        name = update['message']['chat'].get('first_name', '') + ' ' + update['message']['chat'].get('last_name', '')
                        name = name.strip() or username or str(chat_id)
                        
                        self._log_request(chat_id, text, username, name)
                        
                        if text == '/getid':
                            self.send_message(chat_id, f"Ваш Telegram ID: {chat_id}")
                        elif text.startswith('/setname'):
                            name = text[9:].strip()
                            if not name:
                                self.send_message(chat_id, "Пожалуйста, укажите имя после команды /setname, например: /setname Иван")
                            else:
                                self._log_request(chat_id, text, username, name)
                                self.send_message(chat_id, f"Имя '{name}' успешно установлено! Попросите администратора добавить вас в контакты по вашему username.")
                        elif text.lower() == '/mytasks':
                            tasks = self.get_user_tasks_for_week(chat_id)
                            if not tasks:
                                self.send_message(chat_id, "У вас нет задач на ближайшую неделю.")
                            else:
                                message = "*Ваши задачи на ближайшую неделю:*\n\n"
                                for i, task in enumerate(tasks, 1):
                                    message += f"{i}. {self._format_task_message(task)}\n"
                                self.send_message(chat_id, message)
            
            except requests.exceptions.RequestException as e:
                print(f"Ошибка при обработке обновлений: {e}")
            time.sleep(5)

    def start_reminder_thread(self):
        print("Starting reminder and update threads")
        if self.updates_thread and self.updates_thread.is_alive():
            print("Updates thread already running, skipping")
            return
        reminder_thread = threading.Thread(target=self.check_reminders, daemon=True)
        self.updates_thread = threading.Thread(target=self.handle_updates, daemon=True)
        reminder_thread.start()
        self.updates_thread.start()

    def stop(self):
        print("Stopping TelegramService")
        self.is_running = False
        if self.updates_thread:
            self.updates_thread = None