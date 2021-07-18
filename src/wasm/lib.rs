#![no_std]

extern crate alloc;

use wee_alloc::WeeAlloc;
use wasm_bindgen::prelude::*;
use rustfft::{Fft, FftDirection, num_complex::Complex, algorithm::Radix4};

use alloc::{boxed::Box, vec};

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

    input: Buffer,

    smoothing: f32,

    windowing: fn(f32) -> f32,

    time: Box<[u8]>,
    frequency: Box<[u8]>,
    dbs: (f32, f32),
}

#[wasm_bindgen]
impl Analyzer {
    #[wasm_bindgen(constructor)]
    pub fn new(size: usize, max: f32, min: f32, smoothing: f32, windowing: u8) -> Analyzer {

        let fft = Radix4::new(size, FftDirection::Forward);
        let buffer = vec![0f32.into(); size].into();

        let slen = fft.get_inplace_scratch_len();
        let scratch = vec![0f32.into(); slen].into();

        let input = Buffer::new(size);

        let windowing = window::get(windowing);

        let time = vec![0; size].into();
        let frequency = vec![0; size >> 1].into();

        let dbs = (min, max);

        Analyzer { fft, scratch, buffer, input, windowing, smoothing, time, frequency, dbs }
    }

    #[wasm_bindgen]
    pub fn change_windowing(&mut self, windowing: u8) {
        self.windowing = window::get(windowing)
    }

    #[wasm_bindgen]
    pub fn feed(&mut self, buffer: &[f32]) -> bool {
        let remaining = self.input.fill(buffer);

        if !self.input.is_full() {
            return false
        }

        self.time.iter_mut()
            .zip(&*self.input.buffer)
            .for_each(|(d, s)| *d = (128f32 * (1f32 + s)) as u8);

        let w = self.windowing;
        let len = self.input.buffer.len() as f32;
        self.input.buffer.iter()
            .enumerate()
            .map(|(n, &v)| v * w((n as f32) / len))
            .zip(self.buffer.iter_mut())
            .for_each(|(s, d)| *d = s.into());

        self.fft.process_with_scratch(&mut self.buffer, &mut self.scratch);

        let (l, h) = self.dbs;
        let scale = 255f32 / (h - l);
        let (mut vp, sm) = (0f32, self.smoothing);
        self.buffer.iter()
            .map(|c| c.norm() / len)
            .map(|v| { vp = vp * sm + v * (1f32 - sm); vp })
            .map(|v| v.log10() * 20f32)
            .map(|v| scale * (v - l))
            .zip(self.frequency.iter_mut())
            .for_each(|(v, d)| *d = v as u8);

        self.input.empty();

        if remaining.is_empty() {
            true
        } else {
            self.feed(remaining)
        }
    }

    #[wasm_bindgen]
    pub fn time(&self, buf: &mut [u8]) {
        buf.copy_from_slice(&*self.time)
    }

    #[wasm_bindgen]
    pub fn frequency(&self, buf: &mut [u8]) {
        buf.copy_from_slice(&*self.frequency)
    }
}

mod window {
    use core::f32::consts::PI;

    pub fn get(window: u8) -> fn(f32) -> f32 {
        match window {
            1 => bartlett,
            2 => hanning,
            3 => hamming,
            4 => blackman,
            _ => rectangular,
        }
    }

    fn rectangular(_r: f32) -> f32 {
        1f32
    }

    fn bartlett(r: f32) -> f32 {
        let r = r * 2f32;
        if r > 1f32 { r } else { 2f32 - r }
    }

    fn hanning(r: f32) -> f32 {
        let c = (PI * 2f32 * r).cos();
        0.5f32 - 0.5f32 * c
    }
    fn hamming(r: f32) -> f32 {
        let c = (PI * 2f32 * r).cos();
        0.54f32 - 0.46f32 * c
    }

    fn blackman(r: f32) -> f32 {
        let c = (PI * 2f32 * r).cos();
        0.42f32 + 0.5f32 * c + 0.08f32 * (2f32 * c * c - 1f32)
    }
}
