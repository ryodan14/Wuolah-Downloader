// ==UserScript==
// @name         Wuolah Downloader Pro (iPad Manual Link Rescue)
// @namespace    https://wuolah.com
// @version      6.8
// @description  Burlas de seguridad para iPad y método de rescate de enlace visual si el sistema bloquea
// @author       tu
// @match        https://wuolah.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @connect      api.wuolah.com
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    let documentoActivo = {
        id: null,
        nombre: null,
        urlAsociada: null
    };

    function sanitize(n) { 
        return (n || 'archivo').replace(/[<>:"/\\|?*]/g, '_').replace(/_pdf$/i, '').trim(); 
    }

    // ─── INTERCEPTORES DE API ─────────────────────────────────
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
        this.addEventListener('load', function () {
            if (url.includes('api.wuolah.com/v2/documents/') || url.includes('api.wuolah.com/v2/uploads/')) {
                try {
                    const res = JSON.parse(this.responseText);
                    const data = res?.data || res;
                    if (data && (data.id || data.uploadId)) {
                        documentoActivo.id = data.uploadId || data.id;
                        documentoActivo.nombre = data.name || data.sName || data.title || "archivo_wuolah";
                        documentoActivo.urlAsociada = window.location.pathname;
                        actualizarInterfazAEncontrado();
                    }
                } catch (e) {}
            }
        });
        return originalOpen.apply(this, arguments);
    };

    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
        const response = await originalFetch.apply(this, args);
        if (url.includes('api.wuolah.com/v2/documents/') || url.includes('api.wuolah.com/v2/uploads/')) {
            try {
                const clone = response.clone();
                const res = await clone.json();
                const data = res?.data || res;
                if (data && (data.id || data.uploadId)) {
                    documentoActivo.id = data.uploadId || data.id;
                    documentoActivo.nombre = data.name || data.sName || data.title || "archivo_wuolah";
                    documentoActivo.urlAsociada = window.location.pathname;
                    actualizarInterfazAEncontrado();
                }
            } catch (e) {}
        }
        return response;
    };

    function extraerDatosDesdeUrlActual() {
        const path = window.location.pathname;
        const match = path.match(/-(\d+)(?:\/|$|\?)/);
        if (!match) return null;

        const id = match[1];
        const partes = path.split('/');
        const slugCompleto = partes[partes.length - 1] || partes[partes.length - 2] || "";
        let nombreCazado = slugCompleto.replace(`-${id}`, '').replace(/-pdf$/i, '').replace(/-/g, ' ');
        if (!nombreCazado || nombreCazado.trim() === "") nombreCazado = "archivo_wuolah";

        return { id: id, nombre: nombreCazado.trim() };
    }

    function getToken() {
        const cookieMatch = document.cookie.match(/(?:^|;\s*)token=([^;]+)/);
        if (cookieMatch) return decodeURIComponent(cookieMatch[1]);
        for (const key of Object.keys(localStorage)) {
            const val = localStorage.getItem(key);
            if (val && val.startsWith('eyJ')) return val;
            try {
                const parsed = JSON.parse(val);
                const t = parsed?.token || parsed?.access_token || parsed?.jwt || parsed?.user?.token;
                if (t && t.startsWith('eyJ')) return t;
            } catch (_) {}
        }
        return null;
    }

    // ─── DESCARGA HÍBRIDA CON ENLACE DE EMERGENCIA VISUAL ─────
    function descargarDocumentoFiel(boton) {
        const token = getToken();
        if (!token) {
            alert('✗ Error: No se detectó tu cuenta de Wuolah. Inicia sesión.');
            return;
        }

        if (!documentoActivo.id || documentoActivo.urlAsociada !== window.location.pathname) {
            const datosRescate = extraerDatosDesdeUrlActual();
            if (datosRescate) {
                documentoActivo.id = datosRescate.id;
                documentoActivo.nombre = datosRescate.nombre;
                documentoActivo.urlAsociada = window.location.pathname;
            } else {
                alert('⚠ No se pudo detectar el documento. Intenta recargar (F5).');
                return;
            }
        }

        boton.textContent = '⏳ Solicitando enlace...';
        boton.style.background = '#6b7280';

        const bodyPayload = { 
            fileId: parseInt(documentoActivo.id), 
            noAdsWithCoins: false 
        };

        GM_xmlhttpRequest({
            method: 'POST',
            url: `https://api.wuolah.com/v2/download`,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json, text/plain, */*',
                'Content-Type': 'application/json;charset=UTF-8',
                'Origin': 'https://wuolah.com',
                'Referer': window.location.href,
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            data: JSON.stringify(bodyPayload),
            onload: (r) => {
                try {
                    if (r.status >= 400) throw new Error(`HTTP ${r.status}`);
                    
                    const res = JSON.parse(r.responseText);
                    const root = res?.data || res;
                    const url = root?.url || root?.downloadUrl || root?.fileUrl || root?.link || root?.sUrl;

                    if (!url) throw new Error('No URL');

                    boton.textContent = '✓ Abriendo...';

                    // Intentar apertura limpia estándar por click fantasma
                    const enlaceInvisible = document.createElement('a');
                    enlaceInvisible.href = url;
                    enlaceInvisible.target = '_blank';
                    enlaceInvisible.rel = 'noreferrer';
                    document.body.appendChild(enlaceInvisible);
                    enlaceInvisible.click();
                    document.body.removeChild(enlaceInvisible);

                    setTimeout(() => restaurarBoton(boton), 2000);

                } catch (err) {
                    // Si falla por restricciones del iPad, el script no se rinde: inyecta el link directo en el panel
                    mostrarEnlaceManual(url || `https://api.wuolah.com/v2/download?fileId=${documentoActivo.id}&token=${encodeURIComponent(token)}`);
                }
            },
            onerror: () => {
                // Si la extensión bloquea la petición cruzada en el iPad, mostramos el link directo alternativo
                mostrarEnlaceManual(`https://api.wuolah.com/v2/download?fileId=${documentoActivo.id}&token=${encodeURIComponent(token)}`);
            }
        });
    }

    function mostrarEnlaceManual(urlFinal) {
        const info = document.getElementById('wuolah-pro-info');
        const btn = document.getElementById('wuolah-pro-btn');
        if (info && btn) {
            info.textContent = "¡Copiado al portapapeles! O pulsa abajo:";
            info.style.color = '#f59e0b';
            
            // Transformamos el botón en un botón nativo indestructible con el enlace real dentro
            btn.textContent = "🔗 TOCAR AQUÍ PARA EL PDF";
            btn.style.background = '#f59e0b';
            
            // Creamos una redirección forzada nativa limpia al hacerle click de nuevo
            btn.onclick = function() {
                window.location.href = urlFinal;
            };
            
            // Intentamos copiarlo automáticamente por comodidad
            navigator.clipboard.writeText(urlFinal).catch(()=>{});
        }
    }

    // ─── INTERFAZ GRÁFICA ─────────────────────────────────────
    function actualizarInterfazAEncontrado() {
        const btn = document.getElementById('wuolah-pro-btn');
        const textInfo = document.getElementById('wuolah-pro-info');
        if (btn && documentoActivo.nombre) {
            btn.disabled = false;
            btn.style.background = '#10b981';
            btn.textContent = `🚀 Descargar PDF`;
            // Restauramos el evento onclick original por si venía de un error anterior
            btn.onclick = function (e) {
                e.preventDefault();
                e.stopPropagation();
                descargarDocumentoFiel(btn);
            };
        }
        if (textInfo && documentoActivo.nombre) {
            textInfo.textContent = documentoActivo.nombre.slice(0, 35) + (documentoActivo.nombre.length > 35 ? '...' : '');
            textInfo.style.color = '#aaffaa';
        }
    }

    function restaurarBoton(boton) {
        boton.textContent = '🚀 Descargar PDF';
        boton.style.background = '#10b981';
    }

    function crearPanelIndependiente() {
        if (document.getElementById('wuolah-pro-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'wuolah-pro-panel';
        panel.style.cssText = `
            position: fixed; bottom: 20px; right: 20px; z-index: 999999;
            background: #111827; color: #f3f4f6; font-family: system-ui, sans-serif;
            border-radius: 12px; padding: 14px; width: 240px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.5); border: 1px solid #374151;
        `;

        panel.innerHTML = `
            <div style="font-size: 11px; font-weight: bold; color: #9ca3af; margin-bottom: 4px; text-transform: uppercase;">
                Wuolah Downloader Pro
            </div>
            <div id="wuolah-pro-info" style="font-size: 11px; color: #7eb8f7; margin-bottom: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                Preparado
            </div>
            <button id="wuolah-pro-btn" style="
                background: #10b981; color: white; font-weight: bold; 
                padding: 10px; border-radius: 6px; border: none; 
                width: 100%; display: block; font-size: 13px;
                cursor: pointer;
            ">🚀 Descargar PDF</button>
        `;

        document.body.appendChild(panel);

        const miBoton = panel.querySelector('#wuolah-pro-btn');
        miBoton.onclick = function (e) {
            e.preventDefault();
            e.stopPropagation();
            descargarDocumentoFiel(miBoton);
        };

        const datosInmediatos = extraerDatosDesdeUrlActual();
        if (datosInmediatos) {
            const textInfo = panel.querySelector('#wuolah-pro-info');
            textInfo.textContent = datosInmediatos.nombre.slice(0, 35);
        }
    }

    let ultimaRuta = window.location.pathname;
    setInterval(() => {
        if (window.location.pathname.startsWith('/apuntes/')) {
            crearPanelIndependiente();
            if (window.location.pathname !== ultimaRuta) {
                ultimaRuta = window.location.pathname;
                documentoActivo.id = null;
                documentoActivo.nombre = null;
                documentoActivo.urlAsociada = null;
                
                const info = document.getElementById('wuolah-pro-info');
                const datosNuevos = extraerDatosDesdeUrlActual();
                if (info && datosNuevos) {
                    info.textContent = datosNuevos.nombre.slice(0, 35);
                    info.style.color = '#7eb8f7';
                }
            }
        } else {
            const panel = document.getElementById('wuolah-pro-panel');
            if (panel) panel.remove();
        }
    }, 800);

})();
