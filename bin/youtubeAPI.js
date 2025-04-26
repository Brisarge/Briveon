// let player;

// // Load the YouTube API when the script is ready
// function onYouTubeIframeAPIReady() {
//     player = new YT.Player("player", {
//         height: "360",
//         width: "640",
//         videoId: "sF80I-TQiW0", // Default Video ID (Replace with dynamic ID)
//         playerVars: {
//             autoplay: 1, // 1 = Auto-play video
//             controls: 1, // 1 = Show controls
//             modestbranding: 1, // Hides YouTube logo
//             rel: 0, // Prevents showing related videos at the end
//         },
//         events: {
//             onReady: onPlayerReady,
//             onStateChange: onPlayerStateChange
//         }
//     });
// }

// // Function to play the video when ready
// function onPlayerReady(event) {
//     console.log("Player Ready!");
// }

// // Detect state changes (optional: to add event-based logic)
// function onPlayerStateChange(event) {
//     if (event.data == YT.PlayerState.ENDED) {
//         console.log("Video Ended");
//     }
// }

// // Function to dynamically load a new video
// function loadVideo(videoID) {
//     if (player) {
//         player.loadVideoById(videoID);
//     }
// }

// // Example: Change video dynamically on button click
// document.getElementById("changeVideo").addEventListener("click", function() {
//     let newVideoID = prompt("Enter YouTube Video ID:");
//     loadVideo(newVideoID);
// });
