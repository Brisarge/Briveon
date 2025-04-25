let menubool = 0;
function toggleNav() {
    if (menubool == 0) {
        document.getElementById("Nav").style.width = "300px";
        document.getElementById("icon").innerHTML = "&#10006;";
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