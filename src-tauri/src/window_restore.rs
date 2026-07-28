use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc,
    },
    time::{Duration, Instant},
};
use tauri::{Manager, PhysicalPosition, PhysicalSize, WindowEvent};

// Cold-start and login-item relaunches can fire our fullscreen restore while
// macOS is still restoring or relocating the previous fullscreen window, so a
// bare set_fullscreen(true) at startup builds the fullscreen Space against a
// stale screen/frame and overshoots the display until the user manually exits
// and re-enters fullscreen. We skip the window-state plugin's automatic restore
// for "main" and restore it ourselves: a windowed layout restores immediately
// via the plugin, while a fullscreen one waits for the display to settle, then
// places a correctly sized windowed frame centered on a still-attached target
// monitor before entering fullscreen, so macOS sizes the Space on the right
// screen. The window is created hidden (tauri.conf.json visible:false) so this
// intermediate frame never flashes on screen.
const SINGLE_MONITOR_RESTORE_DELAY: Duration = Duration::from_millis(500);
const DISPLAY_QUIET_PERIOD: Duration = Duration::from_millis(200);
const FULLSCREEN_RESTORE_DEADLINE: Duration = Duration::from_secs(2);

// Tauri's own built-in default, used only if "main" is somehow missing from
// tauri.conf.json's window list (should not happen in practice).
const FALLBACK_WINDOW_WIDTH: f64 = 800.0;
const FALLBACK_WINDOW_HEIGHT: f64 = 600.0;

#[derive(serde::Deserialize)]
struct PersistedMainWindow {
    #[serde(default)]
    fullscreen: bool,
    #[serde(default)]
    x: i32,
    #[serde(default)]
    y: i32,
    #[serde(default)]
    width: u32,
    #[serde(default)]
    height: u32,
}

fn saved_main_window(app: &tauri::App) -> Option<PersistedMainWindow> {
    use tauri_plugin_window_state::AppHandleExt;
    let dir = app.path().app_config_dir().ok()?;
    let contents = std::fs::read_to_string(dir.join(app.handle().filename())).ok()?;
    serde_json::from_str::<std::collections::HashMap<String, PersistedMainWindow>>(&contents)
        .ok()?
        .remove("main")
}

fn next_restore_wait(
    elapsed: Duration,
    since_display_activity: Option<Duration>,
) -> Option<Duration> {
    let until_deadline = FULLSCREEN_RESTORE_DEADLINE.saturating_sub(elapsed);
    if until_deadline.is_zero() {
        return None;
    }
    let Some(quiet_for) = since_display_activity else {
        return Some(until_deadline);
    };
    let until_quiet = DISPLAY_QUIET_PERIOD.saturating_sub(quiet_for);
    if until_quiet.is_zero() {
        return None;
    }
    Some(until_quiet.min(until_deadline))
}

// The "main" window's logical size from tauri.conf.json, falling back to
// Tauri's own default only if "main" is somehow absent from the config.
fn configured_window_size(app: &tauri::App) -> (f64, f64) {
    app.config()
        .app
        .windows
        .iter()
        .find(|w| w.label == "main")
        .map_or((FALLBACK_WINDOW_WIDTH, FALLBACK_WINDOW_HEIGHT), |w| {
            (w.width, w.height)
        })
}

// Pick the monitor the window was fullscreen on if it is still attached (its
// saved frame centre lands inside one), else the primary, else any. Returns the
// config-default window size centered on that monitor, in physical pixels.
fn target_windowed_frame(
    app: &tauri::App,
    window: &tauri::WebviewWindow,
    saved: &PersistedMainWindow,
) -> Option<(PhysicalPosition<i32>, PhysicalSize<u32>)> {
    let (default_width, default_height) = configured_window_size(app);
    let monitors = window.available_monitors().ok()?;
    let center_x = saved.x.saturating_add(saved.width as i32 / 2);
    let center_y = saved.y.saturating_add(saved.height as i32 / 2);
    let target = monitors
        .iter()
        .find(|m| {
            let p = m.position();
            let s = m.size();
            center_x >= p.x
                && center_x < p.x + s.width as i32
                && center_y >= p.y
                && center_y < p.y + s.height as i32
        })
        .cloned()
        .or_else(|| window.primary_monitor().ok().flatten())
        .or_else(|| monitors.first().cloned())?;

    let scale = target.scale_factor();
    let win_w = (default_width * scale).round() as u32;
    let win_h = (default_height * scale).round() as u32;
    let mp = target.position();
    let ms = target.size();
    let x = mp.x + (ms.width as i32 - win_w as i32) / 2;
    let y = mp.y + (ms.height as i32 - win_h as i32) / 2;
    Some((PhysicalPosition::new(x, y), PhysicalSize::new(win_w, win_h)))
}

type WindowedFrame = Option<(PhysicalPosition<i32>, PhysicalSize<u32>)>;

fn enter_fullscreen(window: tauri::WebviewWindow, frame: WindowedFrame) {
    let window_on_main = window.clone();
    let _ = window.run_on_main_thread(move || {
        if let Some((position, size)) = frame {
            let _ = window_on_main.set_size(size);
            let _ = window_on_main.set_position(position);
        }
        let _ = window_on_main.show();
        let _ = window_on_main.set_fullscreen(true);
        let _ = window_on_main.set_focus();
    });
}

fn enter_fullscreen_after_delay(
    window: tauri::WebviewWindow,
    frame: WindowedFrame,
    delay: Duration,
) {
    std::thread::spawn(move || {
        std::thread::sleep(delay);
        enter_fullscreen(window, frame);
    });
}

fn enter_fullscreen_after_display_settles(window: tauri::WebviewWindow, frame: WindowedFrame) {
    let (display_activity_tx, display_activity_rx) = mpsc::channel();
    let restored = Arc::new(AtomicBool::new(false));
    let event_restored = Arc::clone(&restored);
    window.on_window_event(move |event| {
        if event_restored.load(Ordering::Acquire) {
            return;
        }
        if matches!(
            event,
            WindowEvent::Moved(_)
                | WindowEvent::Resized(_)
                | WindowEvent::ScaleFactorChanged { .. }
        ) {
            let _ = display_activity_tx.send(());
        }
    });

    std::thread::spawn(move || {
        let started_at = Instant::now();
        let mut last_display_activity: Option<Instant> = None;
        loop {
            let wait = next_restore_wait(
                started_at.elapsed(),
                last_display_activity.map(|activity| activity.elapsed()),
            );
            let Some(wait) = wait else {
                break;
            };
            match display_activity_rx.recv_timeout(wait) {
                Ok(()) => last_display_activity = Some(Instant::now()),
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
        restored.store(true, Ordering::Release);
        enter_fullscreen(window, frame);
    });
}

pub fn restore_main_window(app: &tauri::App) {
    use tauri_plugin_window_state::{StateFlags, WindowExt};
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    // An absent or unreadable state file means "show the config-default window";
    // restore_state(all) here could reapply corrupt geometry from a bad file.
    let Some(saved) = saved_main_window(app) else {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    };
    if !saved.fullscreen {
        let _ = window.restore_state(StateFlags::all());
        return;
    }
    let frame = target_windowed_frame(app, &window, &saved);
    match window.available_monitors() {
        Ok(monitors) if monitors.len() == 1 => {
            enter_fullscreen_after_delay(window, frame, SINGLE_MONITOR_RESTORE_DELAY);
        }
        _ => enter_fullscreen_after_display_settles(window, frame),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn no_display_activity_waits_for_the_hard_deadline() {
        let wait = next_restore_wait(Duration::ZERO, None);

        assert_eq!(wait, Some(Duration::from_secs(2)));
    }

    #[test]
    fn display_activity_waits_for_the_quiet_period() {
        let wait = next_restore_wait(Duration::from_millis(500), Some(Duration::ZERO));

        assert_eq!(wait, Some(Duration::from_millis(200)));
    }

    #[test]
    fn quiet_display_restores_without_another_wait() {
        let wait = next_restore_wait(Duration::from_millis(700), Some(Duration::from_millis(200)));

        assert_eq!(wait, None);
    }

    #[test]
    fn hard_deadline_caps_the_quiet_period() {
        let wait = next_restore_wait(
            Duration::from_millis(1_900),
            Some(Duration::from_millis(50)),
        );

        assert_eq!(wait, Some(Duration::from_millis(100)));
    }
}
