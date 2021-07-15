#![no_std]

extern crate alloc;

use core::f32::consts::PI;

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

    time: Box<[u8]>,
    frequency: Box<[u8]>,
    dbs: (f32, f32),
}

#[wasm_bindgen]
impl Analyzer {
    #[wasm_bindgen(constructor)]
    pub fn new(size: usize, min: f32, max: f32, _smooth: f32) -> Analyzer {

        let fft = Radix4::new(size, FftDirection::Forward);
        let buffer = vec![0f32.into(); size].into();

        let slen = fft.get_inplace_scratch_len();
        let scratch = vec![0f32.into(); slen].into();

        let input = Buffer::new(size);

        let time = vec![0; size].into();
        let frequency = vec![0; size >> 1].into();

        let dbs = (min, max);

        Analyzer { fft, scratch, buffer, input, time, frequency, dbs }
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

        let len = self.input.buffer.len() as f32;
        self.input.buffer.iter()
            .enumerate()
            .map(|(n, &v)| v * Self::blackman((n as f32) / len))
            .zip(self.buffer.iter_mut())
            .for_each(|(s, d)| *d = s.into());

        self.fft.process_with_scratch(&mut self.buffer, &mut self.scratch);

        let (l, h) = self.dbs;
        let scale = 255f32 / (h - l);
        self.buffer.iter()
            .map(|c| (c.norm() / len).log10() * 20f32)
            .map(|c| scale * (c - l))
            .zip(self.frequency.iter_mut())
            .for_each(|(s, d)| *d = s as u8);

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

    fn blackman(r: f32) -> f32 {
        let a = 0.16f32;
        let (a0, a1, a2) = ((1f32 - a) / 2f32, 0.5f32, a / 2f32);
        let c = (PI * 2f32 * r).cos();
        a0 + a1 * c + a2 * (2f32 * c * c - 1f32)
    }
}
