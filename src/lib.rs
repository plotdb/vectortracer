#![allow(non_snake_case)]
#![allow(unused_parens)]
use web_sys::{console, ImageData};
mod svg;
mod utils;
use serde::{Deserialize, Serialize};
use svg::*;
use tsify::Tsify;
use visioncortex::{
	clusters::Clusters, color_clusters, BinaryImage, Color, ColorImage, ColorName,
	PathSimplifyMode,
};
use wasm_bindgen::prelude::*;

#[allow(dead_code)]
fn log(string: &str) { console::log_1(&wasm_bindgen::JsValue::from_str(string)); }
#[wasm_bindgen(start)]
pub fn main() {
	utils::set_panic_hook();
	console_log::init().unwrap();
}
pub fn path_simplify_mode(s: &str) -> PathSimplifyMode {
	match s {
		"polygon" => PathSimplifyMode::Polygon,
		"spline" => PathSimplifyMode::Spline,
		"none" => PathSimplifyMode::None,
		_ => panic!("unknown PathSimplifyMode {}", s),
	}
}

#[derive(Tsify, Debug, Serialize, Deserialize)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct RawImageData {
	#[tsify(type = "Uint8ClampedArray")]
	pub data: Vec<u8>,
	pub width: usize,
	pub height: usize,
}

#[derive(Debug)]
pub struct DebugImageData {
	pub data_len: usize,
	pub first_val: bool,
	pub width: usize,
	pub height: usize,
}

// these are the defults used in vtracer's demo app

fn default_mode() -> String { "spline".to_string() }
fn default_scale() -> f32 { 1.0 }
fn default_cornerThreshold() -> f64 { 60.0_f64.to_radians() }
fn default_lengthThreshold() -> f64 { 4.0 }
fn default_maxIterations() -> usize { 10 }
fn default_spliceThreshold() -> f64 { 45.0_f64.to_radians() }
fn default_filterSpeckle() -> usize { 4 }
fn default_pathPrecision() -> u32 { 8 }

#[derive(Tsify, Debug, Serialize, Deserialize)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct BinaryImageConverterParams {
	pub debug: Option<bool>,
	/** Default is spline. none = pixel. */
	#[tsify(type = "'polygon'|'spline'|'none'")]
	#[serde(default = "default_mode")]
	pub mode: String,
	/** Must be in radians. Default is 60deg */
	#[serde(default = "default_cornerThreshold")]
	pub cornerThreshold: f64,
	/** Default is 4. */
	#[serde(default = "default_lengthThreshold")]
	pub lengthThreshold: f64,
	/** Default is 10. */
	#[serde(default = "default_maxIterations")]
	pub maxIterations: usize,
	/** Must be in radians. Default is 45deg */
	#[serde(default = "default_spliceThreshold")]
	pub spliceThreshold: f64,
	/** Default is 4. */
	#[serde(default = "default_filterSpeckle")]
	pub filterSpeckle: usize,
	/** Default is 8. */
	#[serde(default = "default_pathPrecision")]
	pub pathPrecision: u32,
}

#[derive(Tsify, Debug, Serialize, Deserialize)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct Options {
	/** Process an inverted version of the image. */
	pub invert: Option<bool>,
	/** The color to set for the path fill property. By the default this is the color returned by visioncortex's binary converter (i.e. black).*/
	pub pathFill: Option<String>,
	/** The color given to the svg element background, white by default. This is set in a style tag.*/
	pub backgroundColor: Option<String>,
	/** Additional attributes to add to the svg. For now this is a string to simplify things, therefore you cannot specify a style tag, or if you do, you're overriding the default one which contains the background color.*/
	pub attributes: Option<String>,
	/** Create a group and scale the final svg by this amount.*/
	#[serde(default = "default_scale")]
	pub scale: f32,
}

#[wasm_bindgen]
pub struct BinaryImageConverter {
	debug: bool,
	clusters: Clusters,
	counter: usize,
	mode: PathSimplifyMode,
	converterOptions: BinaryImageConverterParams,
	image: BinaryImage,
	svg: Svg,
}

#[wasm_bindgen]
impl BinaryImageConverter {
	#[wasm_bindgen(constructor)]
	// Tsify automatically converts params using serde_wasm_bindgen::from_value(params) where params was JsValue
	pub fn new(
		imageData: ImageData,
		converterOptions: BinaryImageConverterParams,
		options: Options,
	) -> Self {
		let data = imageData.data();
		let len = data.len();
		let img_width = imageData.width();
		let img_height = imageData.height();
		let colorImage = ColorImage {
			width: img_width as usize,
			height: img_height as usize,
			pixels: data.to_vec(),
		};
		let invert = options.invert.unwrap_or_default();
		let image = colorImage.to_binary_image(|x| if invert { x.r > 128 } else { x.r < 128 });
		let debug = converterOptions.debug.is_some_and(|x| x == true);
		if (debug) {
			log(format!("{:#?}", converterOptions).as_str());
			log(format!(
				"{:#?}",
				DebugImageData {
					width: image.width,
					first_val: image.get_pixel_safe(0, 0),
					height: image.height,
					data_len: len
				}
			)
			.as_str());
		}
		Self {
			debug,
			clusters: Clusters::default(),
			counter: 0,
			mode: path_simplify_mode(&converterOptions.mode),
			image,
			converterOptions,
			svg: Svg::new(SvgOptions {
				scale: options.scale,
				backgroundColor: options.backgroundColor.clone(),
				pathFill: options.pathFill.clone(),
				attributes: options.attributes.clone(),
				width: Some(img_width),
				height: Some(img_height),
			}),
		}
	}

	pub fn init(&mut self) {
		self.clusters = self.image.to_clusters(false);
		if (self.debug) {
			log(format!("clusters length {:?}", self.clusters.len()).as_str());
		}
	}

	pub fn tick(&mut self) -> bool {
		if self.counter < self.clusters.len() {
			let cluster = self.clusters.get_cluster(self.counter);
			if cluster.size() >= self.converterOptions.filterSpeckle {
				let paths = cluster.to_compound_path(
					self.mode,
					self.converterOptions.cornerThreshold,
					self.converterOptions.lengthThreshold,
					self.converterOptions.maxIterations,
					self.converterOptions.spliceThreshold,
				);
				let color = Color::color(&ColorName::Black);
				self.svg
					.add_path(&paths, &color, Some(self.converterOptions.pathPrecision));
			} else {
				if (self.debug) {
					log(format!(
						"cluster of size ({:#?}) smaller than filterSpeckle, cluster discarded",
						cluster.size()
					)
					.as_str());
				}
			}
			self.counter += 1;
			false
		} else {
			true
		}
	}
	pub fn getResult(&self) -> String {
		let result = self.svg.get_svg_string();

		if (self.debug) {
			log(&result.as_str());
		};
		result
	}

	pub fn progress(&self) -> u32 {
		let total = self.clusters.len();
		if (total == 0) {
			return 100;
		}
		100 * (self.counter as u32 / total as u32)
	}
}

fn default_colorPrecision() -> i32 { 6 }
fn default_layerDifference() -> i32 { 16 }

#[derive(Tsify, Debug, Serialize, Deserialize)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct ColorImageConverterParams {
	pub debug: Option<bool>,
	#[tsify(type = "'polygon'|'spline'|'none'")]
	#[serde(default = "default_mode")]
	pub mode: String,
	#[serde(default = "default_cornerThreshold")]
	pub cornerThreshold: f64,
	#[serde(default = "default_lengthThreshold")]
	pub lengthThreshold: f64,
	#[serde(default = "default_maxIterations")]
	pub maxIterations: usize,
	#[serde(default = "default_spliceThreshold")]
	pub spliceThreshold: f64,
	#[serde(default = "default_filterSpeckle")]
	pub filterSpeckle: usize,
	#[serde(default = "default_pathPrecision")]
	pub pathPrecision: u32,
	/// 0 = fewest colors (most merging), 8 = most colors (least merging). Default 6. Maps to is_same_color_a = 8 - colorPrecision.
	#[serde(default = "default_colorPrecision")]
	pub colorPrecision: i32,
	/// Controls layer separation. Default 16. Maps to deepen_diff and diagonal.
	#[serde(default = "default_layerDifference")]
	pub layerDifference: i32,
}

enum ColorConverterState {
	Building(color_clusters::IncrementalBuilder),
	Tracing(color_clusters::Clusters, usize),
	Done,
}

#[wasm_bindgen]
pub struct ColorImageConverter {
	debug: bool,
	state: ColorConverterState,
	mode: PathSimplifyMode,
	converterOptions: ColorImageConverterParams,
	svg: Svg,
}

#[wasm_bindgen]
impl ColorImageConverter {
	#[wasm_bindgen(constructor)]
	pub fn new(
		imageData: ImageData,
		converterOptions: ColorImageConverterParams,
		options: Options,
	) -> Self {
		let img_width = imageData.width();
		let img_height = imageData.height();
		let color_image = ColorImage {
			width: img_width as usize,
			height: img_height as usize,
			pixels: imageData.data().to_vec(),
		};
		let debug = converterOptions.debug.is_some_and(|x| x == true);

		let runner_config = color_clusters::RunnerConfig {
			diagonal: converterOptions.layerDifference == 0,
			hierarchical: u32::MAX,
			batch_size: 25600,
			good_min_area: converterOptions.filterSpeckle * converterOptions.filterSpeckle,
			good_max_area: (img_width * img_height) as usize,
			is_same_color_a: 8 - converterOptions.colorPrecision,
			is_same_color_b: 1,
			deepen_diff: converterOptions.layerDifference,
			hollow_neighbours: 1,
			key_color: Color::default(),
			keying_action: color_clusters::KeyingAction::default(),
		};

		let builder = color_clusters::Runner::new(runner_config, color_image).start();

		Self {
			debug,
			state: ColorConverterState::Building(builder),
			mode: path_simplify_mode(&converterOptions.mode),
			converterOptions,
			svg: Svg::new(SvgOptions {
				scale: options.scale,
				backgroundColor: options.backgroundColor.clone(),
				pathFill: options.pathFill.clone(),
				attributes: options.attributes.clone(),
				width: Some(img_width),
				height: Some(img_height),
			}),
		}
	}

	pub fn init(&mut self) {
		// clustering starts in the constructor; this is a no-op kept for API symmetry
	}

	pub fn tick(&mut self) -> bool {
		match &mut self.state {
			ColorConverterState::Building(builder) => {
				let done = builder.tick();
				if done {
					// replace state: take builder out via a temporary swap
					let old = std::mem::replace(
						&mut self.state,
						ColorConverterState::Done,
					);
					if let ColorConverterState::Building(mut b) = old {
						let clusters = b.result();
						if self.debug {
							log(format!("color clusters output_len: {}", clusters.output_len()).as_str());
						}
						self.state = ColorConverterState::Tracing(clusters, 0);
					}
				}
				false
			}
			ColorConverterState::Tracing(clusters, counter) => {
				let view = clusters.view();
				let total = view.clusters_output.len();
				if *counter < total {
					// iterate in reverse so background (large) clusters are added first,
					// foreground clusters are painted on top in SVG order
					let index = view.clusters_output[total - 1 - *counter];
					let cluster = view.get_cluster(index);
					*counter += 1;
					let paths = cluster.to_compound_path(
						&view,
						false,
						self.mode,
						self.converterOptions.cornerThreshold,
						self.converterOptions.lengthThreshold,
						self.converterOptions.maxIterations,
						self.converterOptions.spliceThreshold,
					);
					self.svg.add_path(
						&paths,
						&cluster.residue_color(),
						Some(self.converterOptions.pathPrecision),
					);
					false
				} else {
					self.state = ColorConverterState::Done;
					true
				}
			}
			ColorConverterState::Done => true,
		}
	}

	pub fn getResult(&self) -> String {
		let result = self.svg.get_svg_string();
		if self.debug {
			log(&result);
		}
		result
	}

	pub fn progress(&self) -> u32 {
		match &self.state {
			ColorConverterState::Building(builder) => builder.progress() / 2,
			ColorConverterState::Tracing(clusters, counter) => {
				let total = clusters.output_len();
				if total == 0 {
					return 100;
				}
				50 + 50 * (*counter as u32) / (total as u32)
			}
			ColorConverterState::Done => 100,
		}
	}
}
