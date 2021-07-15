#![no_std]

extern crate alloc;

use wee_alloc::WeeAlloc;
use wasm_bindgen::prelude::*;
use rustfft::{Fft, FftDirection, num_complex::Complex, algorithm::Radix4};

use alloc::{boxed::Box, vec, format};

#[global_allocator]
static ALLOC: WeeAlloc = WeeAlloc::INIT;

struct Buffer {
    buffer: Box<[f32]>,
    len: usize,
}

impl Buffer {
    fn new(capacity: usize) -> Self {
        let buffer = vec![0f32; capacity].into();
        Self { buffer, len: 0 }
    }

    fn is_full(&self) -> bool {
        self.len == self.buffer.len()
    }

    fn fill<'a>(&mut self, slice: &'a [f32]) -> &'a [f32] {
        let buf = &mut self.buffer[self.len..];
        let len = slice.len().min(buf.len());
        let (slice, remaining) = slice.split_at(len);
        buf[..len].copy_from_slice(slice);
        self.len += slice.len();
        remaining
    }

    fn empty(&mut self) {
        self.len = 0
    }
}

#[wasm_bindgen]
pub struct Analyzer {
    fft: Radix4<f32>,
    buffer: Box<[Complex<f32>]>,
    scratch: Box<[Complex<f32>]>,
    time1: Buffer,
    time2: Buffer,
    frequency: Box<[f32]>,
}

#[wasm_bindgen]
impl Analyzer {
    #[wasm_bindgen(constructor)]
    pub fn new(size: usize) -> Analyzer {

        let fft = Radix4::new(size, FftDirection::Forward);
        let buffer = vec![0f32.into(); size].into();

        let slen = fft.get_inplace_scratch_len();
        let scratch = vec![0f32.into(); slen].into();

        let time1 = Buffer::new(size);
        let time2 = Buffer::new(size);
        let frequency = vec![0f32; size >> 1].into();

        Analyzer { fft, scratch, buffer, time1, time2, frequency }
    }

    fn status(&self) -> (bool, bool) {
        (self.time1.is_full(), self.time2.is_full())
    }

    #[wasm_bindgen]
    pub fn feed(&mut self, buffer: &[f32]) -> Result<bool, JsValue> {
        let (full, main, init) = match self.status() {
            (false, false) => (&mut self.time1, &mut self.time2, true),
            (true , false) => (&mut self.time1, &mut self.time2, false),
            (false, true ) => (&mut self.time2, &mut self.time1, false),
            (true , true ) => return Err("BOTH FULL BUG!".into()),
        };

        if buffer.is_empty() {
            return Ok(false)
        }

        let remaining = main.fill(buffer);

        if init {
            return self.feed(remaining)
        }

        if !main.is_full() {
            return Ok(false)
        }

        self.buffer.iter_mut()
            .zip(&*main.buffer)
            .for_each(|(d, s)| *d = s.into());

        self.fft.process_with_scratch(&mut self.buffer, &mut self.scratch);

        self.buffer.iter()
            .zip(self.frequency.iter_mut())
            .for_each(|(s, d)| *d = s.norm());

        full.empty();

        if full.fill(remaining).is_empty() {
            Ok(true)
        } else {
            Err(format!("Buffer is too big: {}", buffer.len()).into())
        }
    }

    #[wasm_bindgen]
    pub fn time(&self, buf: &mut [f32]) -> bool {
        let time = match self.status() {
            (true, false) => Some(&*self.time1.buffer),
            (false, true) => Some(&*self.time2.buffer),
            _ => None,
        };

        if let Some(time) = time {
            buf.copy_from_slice(time)
        }
        
        time.is_some()
    }

    #[wasm_bindgen]
    pub fn frequency(&self, buf: &mut [f32]) {
        buf.copy_from_slice(&self.frequency)
    }
}
