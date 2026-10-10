import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class DesktopPictureFramePrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window.set_default_size(600, 680);

        const page = new Adw.PreferencesPage({
            title: 'Desktop Picture Frame',
            icon_name: 'image-x-generic-symbolic',
        });
        window.add(page);

        // ── Source ────────────────────────────────────────────────────────────
        const sourceGroup = new Adw.PreferencesGroup({title: 'Image Source'});
        page.add(sourceGroup);

        const folderRow = new Adw.ActionRow({
            title: 'Image Folder',
            subtitle: settings.get_string('image-folder') || 'No folder selected',
            activatable: true,
        });
        const folderBtn = new Gtk.Button({label: 'Choose…', valign: Gtk.Align.CENTER});
        folderBtn.connect('clicked', () => {
            const dialog = new Gtk.FileDialog({title: 'Select Image Folder'});
            dialog.select_folder(window, null, (d, result) => {
                try {
                    const file = d.select_folder_finish(result);
                    if (file) {
                        settings.set_string('image-folder', file.get_path());
                        folderRow.set_subtitle(file.get_path());
                    }
                } catch (_e) {}
            });
        });
        folderRow.add_suffix(folderBtn);
        folderRow.set_activatable_widget(folderBtn);
        sourceGroup.add(folderRow);

        const intervalRow = new Adw.SpinRow({
            title: 'Change Interval',
            subtitle: 'Seconds between images (0 = show one image only)',
            adjustment: new Gtk.Adjustment({
                lower: 0, upper: 3600,
                step_increment: 5, page_increment: 60,
                value: settings.get_int('interval'),
            }),
        });
        settings.bind('interval', intervalRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        sourceGroup.add(intervalRow);

        // ── Size ─────────────────────────────────────────────────────────────
        const sizeGroup = new Adw.PreferencesGroup({title: 'Size'});
        page.add(sizeGroup);

        const widthRow = new Adw.SpinRow({
            title: 'Width',
            subtitle: 'Pixels',
            adjustment: new Gtk.Adjustment({
                lower: 50, upper: 3840,
                step_increment: 10, page_increment: 100,
                value: settings.get_int('widget-width'),
            }),
        });
        settings.bind('widget-width', widthRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        sizeGroup.add(widthRow);

        const heightRow = new Adw.SpinRow({
            title: 'Height',
            subtitle: 'Pixels',
            adjustment: new Gtk.Adjustment({
                lower: 50, upper: 2160,
                step_increment: 10, page_increment: 100,
                value: settings.get_int('widget-height'),
            }),
        });
        settings.bind('widget-height', heightRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        sizeGroup.add(heightRow);

        // ── Appearance ───────────────────────────────────────────────────────
        const appearanceGroup = new Adw.PreferencesGroup({title: 'Appearance'});
        page.add(appearanceGroup);

        const radiusRow = new Adw.SpinRow({
            title: 'Corner Radius',
            subtitle: 'Pixels (0 = sharp corners)',
            adjustment: new Gtk.Adjustment({
                lower: 0, upper: 100,
                step_increment: 1, page_increment: 10,
                value: settings.get_int('corner-radius'),
            }),
        });
        settings.bind('corner-radius', radiusRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        appearanceGroup.add(radiusRow);

        // ── Position ─────────────────────────────────────────────────────────
        const posGroup = new Adw.PreferencesGroup({
            title: 'Position',
            description: 'You can also drag the widget on the desktop to reposition it.',
        });
        page.add(posGroup);

        const xRow = new Adw.SpinRow({
            title: 'X',
            adjustment: new Gtk.Adjustment({
                lower: 0, upper: 7680,
                step_increment: 10, page_increment: 100,
                value: settings.get_int('widget-x'),
            }),
        });
        settings.bind('widget-x', xRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        posGroup.add(xRow);

        const yRow = new Adw.SpinRow({
            title: 'Y',
            adjustment: new Gtk.Adjustment({
                lower: 0, upper: 4320,
                step_increment: 10, page_increment: 100,
                value: settings.get_int('widget-y'),
            }),
        });
        settings.bind('widget-y', yRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        posGroup.add(yRow);
    }
}
