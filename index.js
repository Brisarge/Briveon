import './cubeneon.js';


let menubool = 0;
let loginbool = 0;
let logobool = 0;



function myClock() {      
  let clock = document.getElementById("clock");
  setInterval(() => {
    clock.textContent = new Date().toLocaleTimeString();
  }, 1000);
}


document.addEventListener("DOMContentLoaded", () => {
  myClock();
});


function loadPage(page) {
  fetch(`/${page}.html`)
    .then(response => response.text())
    .then(html => {
      document.getElementById("mainview").innerHTML = html;
    })
    .catch(error => {
      console.error(`Failed to load ${page}:`, error);
      document.getElementById("mainview").innerHTML = "<p>Error loading page.</p>";
    });
}

function toggleNav() {
  if (menubool == 0) {
      document.getElementById("Nav").style.width = "300px";
        document.getElementById("icon").innerHTML = "&#10006;";
        document.getElementById("logo").style.width = '0px';
        anime({
            targets: '.hamb',
            duration: 100,
            rotate: 180,
            easing: 'easeInOutQuad',
            scale: 1.25
        });
        //document.getElementById("icon").innerHTML = "&#10006;";
        menubool = 1;
      } else if (menubool == 1) {
        document.getElementById("Nav").style.width = "0%";
        document.getElementById("icon").innerHTML = "&#9776;";
        document.getElementById("logo").style.width = '50px';
        anime({
            targets: '.hamb',
            duration: 100,
            rotate: -180,
            easing: 'easeInOutSine',
            scale: 1
            
        });
        //document.getElementById("icon").innerHTML = "&#9776;";
        menubool = 0;
      }
    //document.getElementById("Nav").style.width = "35%";

}

function animateTextOnLoad() {
  anime({
      targets: '.text', // Target all elements with the class "text"
      opacity: [0, 1], // Fade in from 0 to 1 opacity
      translateY: [-100, 0], // Animate from -50px to 0px vertically
      duration: 400, // Animation duration in milliseconds
      easing: 'easeOutQuad', // Easing function
      delay: anime.stagger(100) // Delay each element by 200ms
  });
}

var toggle = false;

function toggleDisplay(elementId) {
  var hamb = document.getElementById('hamb');
  var element = document.getElementById(elementId);
  if (toggle === true) {
      hamb.innerHTML = 'Ʌ';
      toggle = false;
      anime({
        targets: '#menu_content',
        opacity: [0, 1], // Fade in from 0 to 1 opacity
        translateY: [-400, 0], // Animate from -50px to 0px vertically
        duration: 400, // Animation duration in milliseconds
        easing: 'easeOutQuad', // Easing function
        delay: anime.stagger(100) // Delay each element by 200ms
      });
  } else {
      hamb.innerHTML = '☰';
      toggle = true;
      anime({
        targets: '#menu_content',
        opacity: [1, 0], // Fade in from 0 to 1 opacity
        translateY: [0, -400], // Animate from -50px to 0px vertically
        duration: 400, // Animation duration in milliseconds
        easing: 'easeOutQuad', // Easing function
        delay: anime.stagger(100) // Delay each element by 200ms
      });
  }
}

function toggleHamb() {
  toggleDisplay('menu_content');
}

function adjustDisplay() {
  var element = document.querySelector('#menu_content');
  if (window.innerWidth >= 1200 && toggle === true)
    {
      toggle = false;
      document.getElementById('hamb').innerHTML = 'Ʌ';
      anime({
        targets: '#menu_content',
        opacity: [0, 1],
        translateY: [-400, 0],
        duration: 200,
        easing: 'easeInQuad'
      });  // Set to inline when width is 1200px or more
    }
}




// Call the function on window resize
window.addEventListener('resize', adjustDisplay);

// Call the function on page load to set the initial display
window.addEventListener('load', adjustDisplay);

document.getElementById("Welcome").addEventListener("click", () => loadPage("Home"));
document.getElementById("Projects").addEventListener("click", () => loadPage("Projects"));
document.getElementById("About").addEventListener("click", () => loadPage("About"));
