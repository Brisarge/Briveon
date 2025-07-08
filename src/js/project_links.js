import { loadPage } from 'index.js';

document.addEventListener("DOMContentLoaded", () => {
    document.addEventListener("click", (event) => {
        if (event.target.matches(".project-link")) {
            event.preventDefault();
            const projectUrl = event.target.getAttribute("href");
            loadPage(projectUrl);
        }
    });
});