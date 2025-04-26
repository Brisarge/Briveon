// player.js
import { getVideoInfo } from "./youtubeAPI.js";

let player;

// Load YouTube IFrame API
function onYouTubeIframeAPIReady() {
    player = new YT.Player("player", {
        height: "360",
        width: "640",
        videoId: "sF80I-TQiW0", // Default video
        playerVars: {
            autoplay: 1,
            controls: 1,
            modestbranding: 1,
            rel: 0,
        },
        events: {
            onReady: onPlayerReady,
            onStateChange: onPlayerStateChange,
        }
    });
}

// Play video when ready
function onPlayerReady(event) {
    console.log("YouTube Player Ready!");
}

// Detect video state changes
function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.ENDED) {
        console.log("Video Ended!");
    }
}

// Function to change video dynamically
async function loadNewVideo(videoID) {
    const videoInfo = await getVideoInfo(videoID);
    if (videoInfo) {
        player.loadVideoById(videoID);
        document.getElementById("video-title").innerText = videoInfo.title;
        document.getElementById("video-thumbnail").src = videoInfo.thumbnail;
    } else {
        console.error("Could not load video!");
    }
}

// Attach event listener to button
document.getElementById("changeVideo").addEventListener("click", () => {
    let newVideoID = prompt("Enter YouTube Video ID:");
    if (newVideoID) loadNewVideo(newVideoID);
});

// Export player functions if needed
export { loadNewVideo };
