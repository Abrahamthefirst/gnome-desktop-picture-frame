import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GdkPixbuf from 'gi://GdkPixbuf';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const SUPPORTED = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif']);

export default class DesktopPictureFrame extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._settingsConnections = [];
        this._timeoutId = null;
        this._images = [];
        this._currentIndex = 0;
        this._coglCtx = global.stage.get_context().get_backend().get_cogl_context();

        this._buildWidget();
        this._loadImages();
        this._startTimer();

        this._settingsConnections.push(
            this._settings.connect('changed', (_s, key) => this._onSettingsChanged(key))
        );
    }

    disable() {
        this._stopTimer();

        for (const id of this._settingsConnections)
            this._settings.disconnect(id);
        this._settingsConnections = [];

        this._destroyWidget();
        this._coglCtx = null;
        this._images = null;
        this._settings = null;
    }

    _buildWidget() {
        const x = this._settings.get_int('widget-x');
        const y = this._settings.get_int('widget-y');
        const width = this._settings.get_int('widget-width');
        const height = this._settings.get_int('widget-height');
        const radius = this._settings.get_int('corner-radius');

        // Container carries the drop shadow; its own background stays transparent
        this._widget = new St.Widget({
            style: `border-radius: ${radius}px;` +
                   'box-shadow: 0 4px 18px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.3);',
        });
        this._widget.set_size(width, height);
        this._widget.set_position(x, y);

        // Image actor — actual photo rendered here
        this._imageActor = new Clutter.Actor({ width, height });
        this._imageActor.set_content_gravity(Clutter.ContentGravity.RESIZE_FILL);
        this._widget.add_child(this._imageActor);

        // Visual overlay: dim tint + dark border for frame/thickness feel
        this._frameOverlay = new St.Widget({
            style: `border-radius: ${radius}px;` +
                   'background-color: rgba(0,0,0,0.18);' +
                   'border: 2px solid rgba(0,0,0,0.42);',
        });
        this._frameOverlay.set_size(width, height);
        this._widget.add_child(this._frameOverlay);

        Main.layoutManager._backgroundGroup.add_child(this._widget);
    }

    _destroyWidget() {
        if (this._widget) {
            Main.layoutManager._backgroundGroup.remove_child(this._widget);
            this._widget.destroy();
            this._widget = null;
            this._imageActor = null;
            this._frameOverlay = null;
        }
    }

    _loadImages() {
        this._images = [];
        this._currentIndex = 0;

        const folder = this._settings.get_string('image-folder');
        if (!folder) return;

        const dir = Gio.File.new_for_path(folder);
        if (!dir.query_exists(null)) return;

        try {
            const enumerator = dir.enumerate_children('standard::name',
                Gio.FileQueryInfoFlags.NONE, null);
            let info;
            while ((info = enumerator.next_file(null)) !== null) {
                const name = info.get_name();
                const dot = name.lastIndexOf('.');
                if (dot !== -1 && SUPPORTED.has(name.slice(dot).toLowerCase()))
                    this._images.push(GLib.build_filenamev([folder, name]));
            }
            enumerator.close(null);
        } catch (e) {
            logError(e, '[DesktopPictureFrame] folder read failed');
            return;
        }

        for (let i = this._images.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this._images[i], this._images[j]] = [this._images[j], this._images[i]];
        }

        this._showCurrentImage();
    }

    // Paints anti-aliased rounded corners into the pixel data.
    // Returns [pixels, stride, hasAlpha] — pixels is a new Uint8Array ready for Cogl.
    _roundedPixels(pixbuf, radius) {
        if (radius <= 0)
            return [pixbuf.get_pixels(), pixbuf.get_rowstride(), pixbuf.get_has_alpha()];

        // Need an alpha channel to express transparency at corners
        if (!pixbuf.get_has_alpha())
            pixbuf = pixbuf.add_alpha(false, 0, 0, 0);

        const w = pixbuf.get_width();
        const h = pixbuf.get_height();
        const stride = pixbuf.get_rowstride();
        const src = pixbuf.get_pixels();
        const dst = new Uint8Array(src); // copy; we only write alpha bytes in corners

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                // Only corner regions need processing
                let cx, cy;
                if (x < radius && y < radius) {
                    cx = radius - x - 0.5; cy = radius - y - 0.5;
                } else if (x >= w - radius && y < radius) {
                    cx = x - (w - radius) + 0.5; cy = radius - y - 0.5;
                } else if (x < radius && y >= h - radius) {
                    cx = radius - x - 0.5; cy = y - (h - radius) + 0.5;
                } else if (x >= w - radius && y >= h - radius) {
                    cx = x - (w - radius) + 0.5; cy = y - (h - radius) + 0.5;
                } else {
                    continue;
                }

                const dist = Math.sqrt(cx * cx + cy * cy);
                const ai = y * stride + x * 4 + 3;
                if (dist >= radius + 0.5) {
                    dst[ai] = 0; // fully outside
                } else if (dist > radius - 0.5) {
                    // sub-pixel anti-aliased edge
                    dst[ai] = Math.round(dst[ai] * (radius + 0.5 - dist));
                }
                // dist <= radius - 0.5: inside, keep original alpha
            }
        }

        return [dst, stride, true];
    }

    _showCurrentImage() {
        if (!this._images?.length || !this._imageActor || !this._coglCtx) return;

        const path = this._images[this._currentIndex];
        const width = this._settings.get_int('widget-width');
        const height = this._settings.get_int('widget-height');
        const radius = this._settings.get_int('corner-radius');

        try {
            // Load at 3× size (aspect-preserved), then cover-scale + center-crop to exact widget size
            let pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_scale(
                path, width * 3, height * 3, true
            );
            const pW = pixbuf.get_width();
            const pH = pixbuf.get_height();
            const scale = Math.max(width / pW, height / pH);
            const sW = Math.round(pW * scale);
            const sH = Math.round(pH * scale);
            pixbuf = pixbuf.scale_simple(sW, sH, GdkPixbuf.InterpType.BILINEAR);
            const cropX = Math.round((sW - width) / 2);
            const cropY = Math.round((sH - height) / 2);
            pixbuf = pixbuf.new_subpixbuf(cropX, cropY, width, height);

            const [pixels, stride, hasAlpha] = this._roundedPixels(pixbuf, radius);
            const format = hasAlpha
                ? Cogl.PixelFormat.RGBA_8888
                : Cogl.PixelFormat.RGB_888;

            const bitmap = Cogl.Bitmap.new_for_data(
                this._coglCtx,
                pixbuf.get_width(),
                pixbuf.get_height(),
                format,
                stride,
                pixels
            );
            const texture = Cogl.Texture2D.new_from_bitmap(bitmap);
            this._imageActor.set_content(
                Clutter.TextureContent.new_from_texture(texture, null)
            );
        } catch (e) {
            logError(e, '[DesktopPictureFrame] image load failed: ' + path);
        }
    }

    _nextImage() {
        if (!this._images?.length) return;
        this._currentIndex = (this._currentIndex + 1) % this._images.length;
        this._showCurrentImage();
    }

    _startTimer() {
        const interval = this._settings.get_int('interval');
        if (interval <= 0) return;

        this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, interval, () => {
            this._nextImage();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _stopTimer() {
        if (this._timeoutId !== null) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = null;
        }
    }

    _onSettingsChanged(key) {
        switch (key) {
        case 'image-folder':
            this._loadImages();
            break;
        case 'interval':
            this._stopTimer();
            this._startTimer();
            break;
        case 'widget-x':
        case 'widget-y':
            this._widget?.set_position(
                this._settings.get_int('widget-x'),
                this._settings.get_int('widget-y')
            );
            break;
        default:
            this._stopTimer();
            this._destroyWidget();
            this._buildWidget();
            this._showCurrentImage();
            this._startTimer();
        }
    }
}
