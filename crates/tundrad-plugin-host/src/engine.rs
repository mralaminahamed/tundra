use wasmtime::{Config, Engine, ResourceLimiter, Store};

pub struct PluginEngine {
    engine: Engine,
}

impl PluginEngine {
    pub fn new() -> Result<Self, wasmtime::Error> {
        let mut config = Config::new();
        config.async_support(true);
        config.epoch_interruption(true);
        config.consume_fuel(true);
        config.wasm_component_model(true);
        // Disable risky features
        config.wasm_threads(false);
        config.wasm_multi_memory(false);
        // Enable safe perf features
        config.wasm_bulk_memory(true);
        config.wasm_simd(true);
        let engine = Engine::new(&config)?;
        Ok(Self { engine })
    }

    pub fn engine(&self) -> &Engine {
        &self.engine
    }

    /// Create a new store with fuel and memory limits applied.
    /// The store data is wrapped in `StoreData<T>` so the limiter can live
    /// inside the store rather than as a dangling reference to a temporary.
    pub fn new_store<T>(
        &self,
        data: T,
        fuel_limit: u64,
        memory_limit_bytes: usize,
    ) -> Result<Store<StoreData<T>>, wasmtime::Error> {
        let store_data = StoreData {
            inner: data,
            limiter: DefaultLimiter {
                memory_limit: memory_limit_bytes,
            },
        };
        let mut store = Store::new(&self.engine, store_data);
        store.set_fuel(fuel_limit)?;
        store.limiter(|data| &mut data.limiter);
        Ok(store)
    }
}

/// Wraps user data together with the resource limiter so the store can hold
/// a `&mut` to the limiter without returning a reference to a temporary.
pub struct StoreData<T> {
    pub inner: T,
    limiter: DefaultLimiter,
}

struct DefaultLimiter {
    memory_limit: usize,
}

impl ResourceLimiter for DefaultLimiter {
    fn memory_growing(
        &mut self,
        _current: usize,
        desired: usize,
        _maximum: Option<usize>,
    ) -> Result<bool, wasmtime::Error> {
        Ok(desired <= self.memory_limit)
    }

    fn table_growing(
        &mut self,
        _current: usize,
        _desired: usize,
        _maximum: Option<usize>,
    ) -> Result<bool, wasmtime::Error> {
        Ok(true)
    }
}
