#![no_std]

extern crate alloc;

use wee_alloc::WeeAlloc;
use wasm_bindgen::prelude::*;

use alloc::{vec, boxed::Box};
use core::ops::Range;
use core::iter::Cycle;

#[global_allocator]
static ALLOC: WeeAlloc = WeeAlloc::INIT;

#[wasm_bindgen]
pub struct Processor {
    buffer: Box<[f32]>,
    looper: Cycle<Range<usize>>,
}

#[wasm_bindgen]
impl Processor {
    #[wasm_bindgen(constructor)]
    pub fn new(rate: usize) -> Result<Processor, JsValue> {
        let duration = 1; // one second delay
        let buffer = vec![0f32; duration * rate].into_boxed_slice();
        let looper = {0..buffer.len()}.cycle();
        Ok(Processor { buffer, looper })
    }

    #[wasm_bindgen]
    pub fn process(&mut self, x: &[f32], y: &mut [f32]) -> Result<(), JsValue> {
        let d = &mut self.buffer;
        let iter = y.iter_mut()
            .zip(x.iter())
            .zip(&mut self.looper);

        // x is input buffer, y is output buffer:
        //      ┌───┐
        // x ───► + ├─────────────────────┬─► y
        //      └─▲─┘                     │
        //        │  ┌───────┐  ┌──────┐  │
        //       d└──┤ DELAY ◄──┤ -3dB ◄──┘
        //           └───────┘  └──────┘
        for ((y, x), i) in iter {
            *y = *x + d[i];
            d[i] = *y * 0.707;
        }

        Ok(())
    }

    #[wasm_bindgen]
    pub fn panic(&mut self) {
        self.buffer.fill(0f32);
    }
}
