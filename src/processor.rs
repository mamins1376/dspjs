use wasm_bindgen::prelude::*;

use core::ops::{Deref, DerefMut};

#[wasm_bindgen]
pub struct Processor {
    delay: Delay,
}

#[wasm_bindgen]
impl Processor {
    #[wasm_bindgen(constructor)]
    pub fn new(rate: usize) -> Result<Processor, JsValue> {
        let duration = 1; // one second delay
        let delay = Delay::new(duration * rate);
        Ok(Processor { delay })
    }

    #[wasm_bindgen]
    pub fn process(&mut self, x: &[f32], y: &mut [f32]) -> Result<(), JsValue> {
        let d = &mut self.delay;

        // x is input buffer, y is output buffer:
        //      ┌───┐
        // x ───► + ├─────────────────────┬─► y
        //      └─▲─┘                     │
        //        │  ┌───────┐  ┌──────┐  │
        //       d└──┤ DELAY ◄──┤ -3dB ◄──┘
        //           └───────┘  └──────┘
        for (o, i) in y.iter_mut().zip(x.iter()) {
            *o = *i + **d;
            **d = *o * 0.707;

            d.advance();
        }

        Ok(())
    }

    #[wasm_bindgen]
    pub fn panic(&mut self) {
        self.delay.reset()
    }
}

struct Delay {
    buffer: Box<[f32]>,
    pointer: usize,
}

impl Delay {
    fn new(length: usize) -> Self {
        let buffer = vec![0.; length].into();
        let pointer = 0;
        Delay { buffer, pointer }
    }

    fn advance(&mut self) {
        self.pointer += 1;
        if self.pointer == self.buffer.len() {
            self.pointer = 0;
        }
    }

    fn reset(&mut self) {
        self.pointer = 0;
        self.buffer.iter_mut().for_each(|x| *x = 0.);
    }
}

impl Deref for Delay {
    type Target = f32;

    fn deref(&self) -> &f32 {
        unsafe { self.buffer.get_unchecked(self.pointer) }
    }
}

impl DerefMut for Delay {
    fn deref_mut(&mut self) -> &mut f32 {
        unsafe { self.buffer.get_unchecked_mut(self.pointer) }
    }
}
