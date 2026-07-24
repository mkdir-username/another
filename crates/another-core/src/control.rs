use anyhow::Result;
use byteorder::{BigEndian, WriteBytesExt};
use tokio::io::AsyncWriteExt;
use tokio::net::TcpStream;
use tokio::sync::Mutex;

const MSG_TYPE_INJECT_KEYCODE: u8 = 0;
const MSG_TYPE_INJECT_TEXT: u8 = 1;
const MSG_TYPE_INJECT_TOUCH: u8 = 2;
const MSG_TYPE_INJECT_SCROLL: u8 = 3;
#[allow(dead_code)]
const MSG_TYPE_BACK_OR_SCREEN_ON: u8 = 4;
const MSG_TYPE_SET_CLIPBOARD: u8 = 9;
const MSG_TYPE_ROTATE_DEVICE: u8 = 11;

pub const KEYCODE_HOME: u32 = 3;
pub const KEYCODE_BACK: u32 = 4;
pub const KEYCODE_POWER: u32 = 26;
pub const KEYCODE_VOLUME_UP: u32 = 24;
pub const KEYCODE_VOLUME_DOWN: u32 = 25;
pub const KEYCODE_APP_SWITCH: u32 = 187;
pub const KEYCODE_WAKEUP: u32 = 224;

const ACTION_DOWN: u8 = 0;
const ACTION_UP: u8 = 1;
const ACTION_MOVE: u8 = 2;

pub const POINTER_ID_MOUSE: u64 = 0xFFFF_FFFF_FFFF_FFFF;
pub const POINTER_ID_FINGER_A: u64 = 0;
pub const POINTER_ID_FINGER_B: u64 = 1;

fn action_from_str(s: &str) -> u8 {
    match s {
        "down" => ACTION_DOWN,
        "up" => ACTION_UP,
        "move" => ACTION_MOVE,
        _ => ACTION_DOWN,
    }
}

fn build_touch_msg(
    action: &str,
    x: u32,
    y: u32,
    screen_w: u16,
    screen_h: u16,
    pointer_id: u64,
) -> Vec<u8> {
    let mut buf: Vec<u8> = Vec::with_capacity(32);
    WriteBytesExt::write_u8(&mut buf, MSG_TYPE_INJECT_TOUCH).unwrap();
    WriteBytesExt::write_u8(&mut buf, action_from_str(action)).unwrap();
    WriteBytesExt::write_u64::<BigEndian>(&mut buf, pointer_id).unwrap();
    WriteBytesExt::write_u32::<BigEndian>(&mut buf, x).unwrap();
    WriteBytesExt::write_u32::<BigEndian>(&mut buf, y).unwrap();
    WriteBytesExt::write_u16::<BigEndian>(&mut buf, screen_w).unwrap();
    WriteBytesExt::write_u16::<BigEndian>(&mut buf, screen_h).unwrap();
    let pressure: u16 = if action == "up" { 0 } else { 0xFFFF };
    WriteBytesExt::write_u16::<BigEndian>(&mut buf, pressure).unwrap();
    WriteBytesExt::write_u32::<BigEndian>(&mut buf, 1).unwrap();
    WriteBytesExt::write_u32::<BigEndian>(&mut buf, 1).unwrap();
    buf
}

pub async fn inject_touch(
    socket: &Mutex<TcpStream>,
    action: &str,
    x: u32,
    y: u32,
    screen_w: u16,
    screen_h: u16,
    pointer_id: u64,
) -> Result<()> {
    let buf = build_touch_msg(action, x, y, screen_w, screen_h, pointer_id);
    let mut stream = socket.lock().await;
    stream.write_all(&buf).await?;
    Ok(())
}

pub async fn inject_keycode(
    socket: &Mutex<TcpStream>,
    action: &str,
    keycode: u32,
    repeat: u32,
    metastate: u32,
) -> Result<()> {
    let mut buf: Vec<u8> = Vec::with_capacity(14);
    WriteBytesExt::write_u8(&mut buf, MSG_TYPE_INJECT_KEYCODE).unwrap();
    WriteBytesExt::write_u8(&mut buf, action_from_str(action)).unwrap();
    WriteBytesExt::write_u32::<BigEndian>(&mut buf, keycode).unwrap();
    WriteBytesExt::write_u32::<BigEndian>(&mut buf, repeat).unwrap();
    WriteBytesExt::write_u32::<BigEndian>(&mut buf, metastate).unwrap();

    let mut stream = socket.lock().await;
    stream.write_all(&buf).await?;
    Ok(())
}

pub async fn inject_text(socket: &Mutex<TcpStream>, text: &str) -> Result<()> {
    let bytes = text.as_bytes();
    let mut buf: Vec<u8> = Vec::with_capacity(5 + bytes.len());
    WriteBytesExt::write_u8(&mut buf, MSG_TYPE_INJECT_TEXT).unwrap();
    WriteBytesExt::write_u32::<BigEndian>(&mut buf, bytes.len() as u32).unwrap();
    std::io::Write::write_all(&mut buf, bytes).unwrap();

    let mut stream = socket.lock().await;
    stream.write_all(&buf).await?;
    Ok(())
}

fn build_clipboard_msg(text: &str, paste: bool) -> Vec<u8> {
    let bytes = text.as_bytes();
    let mut buf: Vec<u8> = Vec::with_capacity(14 + bytes.len());
    WriteBytesExt::write_u8(&mut buf, MSG_TYPE_SET_CLIPBOARD).unwrap();
    WriteBytesExt::write_u64::<BigEndian>(&mut buf, 0).unwrap();
    WriteBytesExt::write_u8(&mut buf, paste as u8).unwrap();
    WriteBytesExt::write_u32::<BigEndian>(&mut buf, bytes.len() as u32).unwrap();
    std::io::Write::write_all(&mut buf, bytes).unwrap();
    buf
}

/// Sequence 0 asks the device not to acknowledge — there is no return channel for an ack here.
pub async fn set_clipboard(socket: &Mutex<TcpStream>, text: &str, paste: bool) -> Result<()> {
    let buf = build_clipboard_msg(text, paste);
    let mut stream = socket.lock().await;
    stream.write_all(&buf).await?;
    Ok(())
}

pub async fn rotate_device(socket: &Mutex<TcpStream>) -> Result<()> {
    let buf = vec![MSG_TYPE_ROTATE_DEVICE];
    let mut stream = socket.lock().await;
    stream.write_all(&buf).await?;
    Ok(())
}

pub async fn inject_scroll(
    socket: &Mutex<TcpStream>,
    x: u32,
    y: u32,
    screen_w: u16,
    screen_h: u16,
    scroll_x: i16,
    scroll_y: i16,
) -> Result<()> {
    let mut buf: Vec<u8> = Vec::with_capacity(21);
    WriteBytesExt::write_u8(&mut buf, MSG_TYPE_INJECT_SCROLL).unwrap();
    WriteBytesExt::write_u32::<BigEndian>(&mut buf, x).unwrap();
    WriteBytesExt::write_u32::<BigEndian>(&mut buf, y).unwrap();
    WriteBytesExt::write_u16::<BigEndian>(&mut buf, screen_w).unwrap();
    WriteBytesExt::write_u16::<BigEndian>(&mut buf, screen_h).unwrap();
    WriteBytesExt::write_i16::<BigEndian>(&mut buf, scroll_x).unwrap();
    WriteBytesExt::write_i16::<BigEndian>(&mut buf, scroll_y).unwrap();
    WriteBytesExt::write_u32::<BigEndian>(&mut buf, 0).unwrap();

    let mut stream = socket.lock().await;
    stream.write_all(&buf).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn touch_msg_carries_pointer_id() {
        let buf = build_touch_msg("down", 100, 200, 1080, 1920, POINTER_ID_FINGER_B);
        assert_eq!(buf[0], MSG_TYPE_INJECT_TOUCH);
        assert_eq!(buf[1], ACTION_DOWN);
        assert_eq!(&buf[2..10], &1u64.to_be_bytes());
    }

    #[test]
    fn mouse_pointer_id_is_preserved() {
        let buf = build_touch_msg("move", 1, 2, 10, 20, POINTER_ID_MOUSE);
        assert_eq!(&buf[2..10], &[0xFF; 8]);
    }

    #[test]
    fn clipboard_msg_carries_paste_flag_and_utf8() {
        let buf = build_clipboard_msg("привет", true);
        assert_eq!(buf[0], MSG_TYPE_SET_CLIPBOARD);
        assert_eq!(&buf[1..9], &0u64.to_be_bytes());
        assert_eq!(buf[9], 1);
        let text = "привет".as_bytes();
        assert_eq!(&buf[10..14], &(text.len() as u32).to_be_bytes());
        assert_eq!(&buf[14..], text);
    }
}
