// game.js — tiny loader (all logic lives in input.js + sim.js)
(function(){
  const canvas = document.querySelector("canvas") || document.getElementById("game");

  // If you don't already have a canvas in HTML, create one
  let c = canvas;
  if (!c){
    c = document.createElement("canvas");
    c.id = "game";
    document.body.appendChild(c);
  }

  const sim = new window.KDSim(c);

  let last = performance.now();
  function loop(now){
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;

    sim.update(dt);
    sim.draw();

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
