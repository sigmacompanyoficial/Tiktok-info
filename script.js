document.addEventListener('DOMContentLoaded', () => {

    const triggerElements = document.querySelectorAll('.trigger-word');

    let clickCount = 0;
    const clicksNeeded = 10;

    function handleClick() {
        clickCount++;
        // All visual feedback and console logs have been removed for subtlety.
        if (clickCount >= clicksNeeded) {
            window.location.href = 'login.html';
        }
    }

    if (triggerElements.length > 0) {
        triggerElements.forEach(element => {
            element.addEventListener('click', handleClick);
        });
    }
});