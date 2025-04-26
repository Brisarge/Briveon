// main.js
import { loadNewVideo } from "./player.js";

// Load YouTube API script dynamically
function loadYouTubeAPI() {
    let tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.body.appendChild(tag);
}

// Once YouTube API is ready, load a default video
window.onYouTubeIframeAPIReady = function () {
    loadNewVideo("sF80I-TQiW0"); // Load a default video
};

// Handle button click for changing video
document.getElementById("changeVideo").addEventListener("click", () => {
    let newVideoID = prompt("Enter YouTube Video ID:");
    if (newVideoID) loadNewVideo(newVideoID);
});

loadYouTubeAPI(); // Make sure the API loads
