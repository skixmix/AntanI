use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc,
    },
    time::{Duration, Instant},
};
use tauri::{Manager, WindowEvent};

// Login-item relaunches restore the window before the external display / Spaces
// have settled, so the window-state plugin's saved fullscreen SIZE/POSITION land
// on whatever monitor is momentarily current and overshoot it (the reported
// "fullscreen way over the screen size"). We skip the plugin's automatic restore
// for "main" and restore it ourselves: a windowed layout restores immediately,
// but a fullscreen one keeps the config-default frame until DisplayLink's startup
// move settles, then restores only the fullscreen flag so macOS sizes it.
const SINGLE_MONITOR_RESTORE_DELAY: Duration = Duration::from_millis(500);
const DISPLAY_QUIET_PERIOD: Duration = Duration::from_millis(200);
const FULLSCREEN_RESTORE_DEADLINE: Duration = Duration::from_secs(2);

#[derive(serde::Deserialize)]
struct PersistedWindowFullscreen {
    #[serde(default)]
    fullscreen: bool,
}

fn saved_main_was_fullscreen(app: &tauri::App) -> bool {
    use tauri_plugin_window_state::AppHandleExt;
    let Ok(dir) = app.path().app_config_dir() else {
        return false;
    };
    let Ok(contents) = std::fs::read_to_string(dir.join(app.handle().filename())) else {
        return false;
    };
    serde_json::from_str::<std::collections::HashMap<String, PersistedWindowFullscreen>>(&contents)
        .ok()
        .and_then(|windows| windows.get("main").map(|w| w.fullscreen))
        .unwrap_or(false)
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

fn restore_fullscreen(window: tauri::WebviewWindow) {
    use tauri_plugin_window_state::{StateFlags, WindowExt};
    let window_on_main = window.clone();
    let _ = window.run_on_main_thread(move || {
        let _ = window_on_main.restore_state(StateFlags::FULLSCREEN | StateFlags::VISIBLE);
    });
}

fn restore_fullscreen_after_delay(window: tauri::WebviewWindow, delay: Duration) {
    std::thread::spawn(move || {
        std::thread::sleep(delay);
        restore_fullscreen(window);
    });
}

fn restore_fullscreen_after_display_settles(window: tauri::WebviewWindow) {
    let (display_activity_tx, display_activity_rx) = mpsc::channel();
    let restored = Arc::new(AtomicBool::new(false));
    let event_restored = Arc::clone(&restored);
    window.on_window_event(move |event| {
        if event_restored.load(Ordering::Acquire) {
            return;
        }
        if matches!(
            event,
            WindowEvent::Moved(_) | WindowEvent::ScaleFactorChanged { .. }
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
        restore_fullscreen(window);
    });
}

pub fn restore_main_window(app: &tauri::App) {
    use tauri_plugin_window_state::{StateFlags, WindowExt};
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    if !saved_main_was_fullscreen(app) {
        let _ = window.restore_state(StateFlags::all());
        return;
    }
    if window
        .available_monitors()
        .is_ok_and(|monitors| monitors.len() == 1)
    {
        restore_fullscreen_after_delay(window, SINGLE_MONITOR_RESTORE_DELAY);
    } else {
        restore_fullscreen_after_display_settles(window);
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
