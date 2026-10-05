/* mostra na tela qualquer erro de carregamento, para facilitar o suporte */
(function(){
  var shown = 0;
  function show(msg){
    if (shown++ > 4) return;
    var box = document.getElementById("errBox");
    var line = document.createElement("div"); line.className = "msg bad"; line.style.marginTop = "6px";
    line.textContent = "Erro na página: " + msg;
    if (box) box.appendChild(line); else document.addEventListener("DOMContentLoaded", function(){ var b = document.getElementById("errBox"); if (b) b.appendChild(line); });
  }
  window.__showErr = show;
  window.addEventListener("error", function(e){
    if (e && e.target && e.target !== window && (e.target.src || e.target.href)) { show("não carregou o arquivo " + (e.target.src || e.target.href).split("/").pop()); return; }
    show((e && e.message || "erro") + (e && e.filename ? " (" + e.filename.split("/").pop() + ":" + e.lineno + ")" : ""));
  }, true);
  window.addEventListener("unhandledrejection", function(e){ var r = e && e.reason; show("promessa: " + (r && (r.message || r.code) || String(r))); });
  window.addEventListener("securitypolicyviolation", function(e){ show("bloqueado pela segurança do Claude: " + e.violatedDirective + " → " + (e.blockedURI || "inline")); });
  setTimeout(function(){
    if (window.__appStarted) return;
    var miss = [];
    if (!window.jspdf) miss.push("gerador de PDF");
    if (!window.zip) miss.push("leitor de .zip");
    if (!window.Tesseract) miss.push("leitor de texto");
    if (typeof ASSETS === "undefined") miss.push("logos e fontes");
    var b = document.getElementById("bootMsg");
    if (b) { b.className = "msg bad"; b.textContent = "A página não terminou de iniciar." + (miss.length ? " Não carregou: " + miss.join(", ") + "." : "") + " Recarregue (Ctrl+Shift+R). Se continuar, mande um print desta tela."; }
  }, 10000);
})();
