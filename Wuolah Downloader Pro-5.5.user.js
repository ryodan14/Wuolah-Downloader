// ==UserScript==
// @name         Wuolah Downloader Pro (iPad Native Fix)
// @namespace    https://wuolah.com
// @version      5.9
// @description  Descarga con compatibilidad nativa total para iPadOS y iOS usando enlaces HTML5 directos
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

    // ─── INTERCEPTORES API ────────────────────────────────────
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

    // ─── NÚCLEO DE DESCARGA ADAPTADO ──────────────────────────
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
                'Referer': window.location.href
            },
            data: JSON.stringify(bodyPayload),
            onload: (r) => {
                try {
                    if (r.status >= 400) throw new Error(`HTTP ${r.status}`);
                    
                    const res = JSON.parse(r.responseText);
                    const root = res?.data || res;
                    const url = root?.url || root?.downloadUrl || root?.fileUrl || root?.link || root?.sUrl;

                    if (!url) throw new Error('No URL');

                    let nombreFinal = sanitize(documentoActivo.nombre);
                    if (!nombreFinal.toLowerCase().endsWith('.pdf')) nombreFinal += '.pdf';

                    // Detectar entorno Apple Móvil (iPad / iPhone)
                    const esAppleMovil = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

                    if (esAppleMovil) {
                        boton.textContent = '✓ ¡Listo! Toca aquí';
                        boton.style.background = '#3b82f6'; // Cambia a azul indicando que es un enlace físico

                        // Convertimos temporalmente el botón en un enlace directo nativo HTML5
                        const wrapperA = document.createElement('a');
                        wrapperA.href = url;
                        wrapperA.target = '_self'; // Forzamos a abrir en la misma pestaña si las nuevas están capadas
                        wrapperA.style.textDecoration = 'none';
                        
                        // Envolvemos el botón para que al tocarlo el iPad reaccione nativamente al enlace
                        boton.parentNode.insertBefore(wrapperA, boton);
                        wrapperA.appendChild(boton);

                        // Si el usuario vuelve a hacer clic sobre el botón modificado, se abrirá el flujo nativo
                        miBoton.onclick = null; 
                    } else {
                        // Flujo normal para ordenadores
                        boton.textContent = '✓ Guardando...';
                        GM_download({
                            url: url,
                            name: nombreFinal,
                            onerror: () => { window.open(url, '_blank'); restaurarBoton(boton); },
                            onload: () => setTimeout(() => restaurarBoton(boton), 1500)
                        });
                    }

                } catch (err) {
                    alert('Error al procesar la descarga directa.');
                    restaurarBoton(boton);
                }
            },
            onerror: () => {
                alert('Error de conexión.');
                restaurarBoton(boton);
            }
        });
    }

    // ─── INTERFAZ FLOTANTE ────────────────────────────────────
    function actualizarInterfazAEncontrado() {
        const btn = document.getElementById('wuolah-pro-btn');
        const textInfo = document.getElementById('wuolah-pro-info');
        if (btn && documentoActivo.nombre) {
            btn.disabled = false;
            btn.style.background = '#10b981';
            btn.textContent = `🚀 Descargar PDF`;
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
                    
                    // Si la ruta cambió, destruimos herencias de enlaces anteriores para evitar bucles
                    const btn = document.getElementById('wuolah-pro-btn');
                    if (btn && btn.parentNode.tagName === 'A') {
                        const arr = btn.parentNode;
                        arr.parentNode.insertBefore(btn, arr);
                        arr.remove();
                        restaurarBoton(btn);
                    }
                }
            }
        } else {
            const panel = document.getElementById('wuolah-pro-panel');
            if (panel) panel.remove();
        }
    }, 800);

})();
