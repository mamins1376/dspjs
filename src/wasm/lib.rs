#![no_std]

extern crate alloc;

use wee_alloc::WeeAlloc;
use wasm_bindgen::prelude::*;
use rustfft::{Fft, FftDirection, Length, num_complex::Complex, algorithm::Radix4};

use alloc::{boxed::Box, collections::VecDeque, vec};

#[global_allocator]
static ALLOC: WeeAlloc = WeeAlloc::INIT;

#[wasm_bindgen]
pub struct Analyzer {
    fft: Radix4<f32>,
    buffer: VecDeque<Complex<f32>>,
    scratch: Box<[Complex<f32>]>,
    time: Box<[f32]>,
    frequency: Box<[f32]>,
}

#[wasm_bindgen]
impl Analyzer {
    #[wasm_bindgen(constructor)]
    pub fn new(size: usize) -> Analyzer {
        let fft = Radix4::new(size, FftDirection::Forward);
        let slen = fft.get_inplace_scratch_len();

        let buffer = VecDeque::new();
        let scratch = vec![0f32.into(); slen].into();

        let time = vec![0f32; size].into();
        let frequency = vec![0f32; size].into();

        Analyzer { fft, scratch, buffer, time, frequency }
    }

    #[wasm_bindgen]
    pub fn feed(&mut self, buffer: &[f32]) -> bool {
        self.buffer.extend(buffer.iter().map(Complex::from));

        if self.buffer.len() >= self.fft.len() {
            let (buffer, _) = self.buffer.make_contiguous().split_at_mut(self.fft.len());
            buffer.iter()
                .zip(self.time.iter_mut())
                .for_each(|(s, d)| *d = s.re);

            self.fft.process_with_scratch(buffer, &mut *self.scratch);

            self.buffer.drain(..self.fft.len())
                .zip(self.frequency.iter_mut())
                .for_each(|(s, d)| *d = s.norm());

            true
        } else {
            false
        }
    }

    #[wasm_bindgen]
    pub fn time(&mut self, buf: &mut [f32]) {
        let len = self.time.len().min(buf.len());
        buf[..len].copy_from_slice(&self.time[..len]);
    }

    #[wasm_bindgen]
    pub fn frequency(&mut self, buf: &mut [f32]) {
        let len = self.frequency.len().min(buf.len());
        buf[..len].copy_from_slice(&self.frequency[..len]);
    }
}
