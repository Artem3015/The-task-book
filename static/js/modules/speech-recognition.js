export function initializeSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    window.recognition = null;
    
    if (SpeechRecognition) {
        window.recognition = new SpeechRecognition();
        window.recognition.lang = 'ru-RU';
        window.recognition.interimResults = false;
        window.recognition.maxAlternatives = 1;
        
        const voiceInputBtn = document.getElementById('voiceInputBtn');
        if (voiceInputBtn) {
            voiceInputBtn.addEventListener('click', () => {
                window.recognition.start();
                voiceInputBtn.classList.add('bg-green-700');
            });
            
            window.recognition.onresult = (event) => {
                document.getElementById('taskInput').value = event.results[0][0].transcript;
                voiceInputBtn.classList.remove('bg-green-700');
            };
            
            window.recognition.onend = () => {
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