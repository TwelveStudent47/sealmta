const toRegisterButton = document.querySelector(".register-button");
const loginDetails = document.querySelector(".login");
const registerDetails = document.querySelector(".register")
const passwordReminderLogin = document.querySelector(".password-reminder-login");
const passwordReminderRegister = document.querySelector(".password-reminder-register");
const passwordReminderDetails = document.querySelector(".reminder");
const passwordReminderRevert = document.querySelector(".back-to-login");

function displayRemove(removable) {
    removable.style.display = "none";
    removable.style.opacity = 0;
    removable.style.pointerEvents = "none";
};

function displayShow(showable) {
    showable.style.display = "flex";
    showable.style.opacity = 1;
    showable.style.pointerEvents = "all";
};

toRegisterButton.addEventListener("click", () => {
    setTimeout(() => {
        displayRemove(loginDetails);

        displayShow(registerDetails);
    },50)
});

passwordReminderLogin.addEventListener("click", () => {
    displayRemove(loginDetails);

    displayShow(passwordReminderDetails);
});

passwordReminderRegister.addEventListener("click", () => {
    displayRemove(registerDetails);

    displayShow(passwordReminderDetails);
});

passwordReminderRevert.addEventListener("click", () => {
    displayRemove(passwordReminderDetails);

    displayShow(loginDetails);
});

function openCreateModal() {
    document.getElementById('createModal').style.display = 'block';
}

function closeCreateModal() {
    document.getElementById('createModal').style.display = 'none';
}

function filterByCategory(categoryId) {
    if (categoryId) {
        window.location.href = `/forum/category/${categoryId}`;
    } else {
        window.location.href = '/forum';
    }
}

window.onclick = function(event) {
    const modal = document.getElementById('createModal');
    if (event.target === modal) {
        closeCreateModal();
    }
}