// Wallpaper -> accent palette interop for Web.Services.WallpaperPaletteService.
// extractDominant() draws the wallpaper into an offscreen canvas and returns the
// saturation-weighted circular-mean hue of its pixels plus its overall WCAG relative
// luminance (used to auto-darken a too-bright wallpaper — see ComputeScrimOpacity in
// WallpaperPaletteService.cs). Never rejects — resolves null on any failure: 404,
// decode error, or a CORS-tainted canvas blocking getImageData, so the caller can fall
// back to the static CSS palette.
window.nukaPalette = (function () {
    function relativeLuminanceChannel(c) {
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }

    function extractDominant(imageUrl, sampleSize) {
        sampleSize = sampleSize || 48;
        return new Promise(function (resolve) {
            var img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = function () {
                try {
                    var scale = Math.min(1, sampleSize / Math.max(img.naturalWidth, img.naturalHeight));
                    var canvas = document.createElement('canvas');
                    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
                    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
                    var ctx = canvas.getContext('2d', { willReadFrequently: true });
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    var data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

                    var sumSin = 0, sumCos = 0, weight = 0;
                    var sumLuminance = 0, opaqueCount = 0;
                    for (var i = 0; i < data.length; i += 4) {
                        if (data[i + 3] < 128) continue; // skip transparent pixels
                        var r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;

                        // Overall brightness drives the auto-darken decision, so — unlike the
                        // hue vote below — every opaque pixel counts here, including the
                        // near-black/near-white/near-neutral ones that hue deliberately skips.
                        sumLuminance += 0.2126 * relativeLuminanceChannel(r) +
                            0.7152 * relativeLuminanceChannel(g) +
                            0.0722 * relativeLuminanceChannel(b);
                        opaqueCount++;

                        var max = Math.max(r, g, b), min = Math.min(r, g, b);
                        var l = (max + min) / 2;
                        if (l < 0.08 || l > 0.92) continue; // skip near-black/near-white
                        var d = max - min;
                        var s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
                        if (s < 0.15) continue; // skip near-neutral pixels

                        var h;
                        if (d === 0) h = 0;
                        else if (max === r) h = 60 * (((g - b) / d) % 6);
                        else if (max === g) h = 60 * ((b - r) / d + 2);
                        else h = 60 * ((r - g) / d + 4);
                        if (h < 0) h += 360;

                        var rad = h * Math.PI / 180;
                        sumSin += Math.sin(rad) * s;
                        sumCos += Math.cos(rad) * s;
                        weight += s;
                    }

                    if (opaqueCount === 0) { resolve(null); return; }
                    var luminance = sumLuminance / opaqueCount;

                    if (weight === 0) {
                        // No pixel was saturated enough to vote on a hue (greyscale/near-mono
                        // photo) — still report luminance so the caller can darken it if it's
                        // too bright, just with an arbitrary (unused-looking) hue.
                        resolve({ hue: 0, saturation: 0, luminance: luminance });
                        return;
                    }
                    var hue = Math.atan2(sumSin, sumCos) * 180 / Math.PI;
                    if (hue < 0) hue += 360;
                    resolve({ hue: hue, saturation: Math.min(1, weight / (data.length / 4)), luminance: luminance });
                } catch (err) {
                    // getImageData throws SecurityError on a CORS-tainted canvas
                    resolve(null);
                }
            };
            img.onerror = function () { resolve(null); };
            img.src = imageUrl;
        });
    }

    function setVars(vars) {
        var root = document.documentElement.style;
        for (var key in vars) {
            if (Object.prototype.hasOwnProperty.call(vars, key)) {
                root.setProperty(key, vars[key]);
            }
        }
    }

    return { extractDominant: extractDominant, setVars: setVars };
})();
