
// Prevent back navigation
window.history.pushState(null, "", window.location.href);
window.onpopstate = function () {
    window.history.pushState(null, "", window.location.href);
    alert("You cannot use the browser back button during the experiment.");
};
// Trigger warning that answers will not be saved
// A variable to hold our listener function reference
// This will be added while the experiment runs, and removed when the experiment is done.
// let beforeUnloadListener = function (e) {
//     e.preventDefault();
//     e.returnValue = 'Progress will be lost if you leave this page.'; // Custom message for most browsers
// };
// window.addEventListener('beforeunload', beforeUnloadListener);

const EXPERIMENT_SEED = 12345;
let randomSeed = EXPERIMENT_SEED;
Math.random = function () {
    randomSeed = (1664525 * randomSeed + 1013904223) >>> 0;
    return randomSeed / 4294967296;
};
console.info(`Experiment seed: ${EXPERIMENT_SEED}`);

// WebGl stuff
async function loadShaderSource(path, basePath = "shaders/") {
  const loadedFiles = new Map();

  async function loadRecursive(filePath) {
    if (loadedFiles.has(filePath)) {
      return loadedFiles.get(filePath); // Prevent circular includes
    }

    const response = await fetch(basePath + filePath);
    if (!response.ok) {
      throw new Error(`Failed to load ${filePath}`);
    }

    let source = await response.text();

    const includePattern = /#include\s+"(.+?)"/g;
    const matches = [...source.matchAll(includePattern)];

    for (const match of matches) {
      const includePath = match[1];
      const includeSource = await loadRecursive(includePath);
      source = source.replace(match[0], includeSource);
    }

    loadedFiles.set(filePath, source);
    return source;
  }

  return loadRecursive(path);
}
function createShader(gl, type, source) { 
  const shader = gl.createShader(type); 
  gl.shaderSource(shader, source); 
  gl.compileShader(shader); 
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { 
    console.error("Shader compile error:", gl.getShaderInfoLog(shader)); 
    return null; 
  } 
  return shader; 
} 
function createProgram(gl, vertexSource, fragmentSource) { 
  const vs = createShader(gl, gl.VERTEX_SHADER, vertexSource); 
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource); 
  const program = gl.createProgram(); 
  gl.attachShader(program, vs); 
  gl.attachShader(program, fs); 
  gl.linkProgram(program); 
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { 
    console.error("Program link error:", gl.getProgramInfoLog(program)); 
    return null; 
  } 
  return program; 
}

function createBuffer(gl, width, height, num_attachments) {
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  const attachments = [];
  const textures = [];

  // Extensions
  const extHalf = gl.getExtension('EXT_color_buffer_half_float');
  const extFloat = gl.getExtension('EXT_color_buffer_float');


  // Decide format/type
  let internalFormat, type;
  if (extFloat) {
    internalFormat = gl.R32F;
    type = gl.FLOAT;
    console.info("float");
  }
  else if (extHalf) {
    internalFormat = gl.R16F;
    type = gl.HALF_FLOAT;
    console.info("half float");
  } else {
    internalFormat = gl.R8;
    type = gl.UNSIGNED_BYTE;
    console.info("fallback");
  }

  for (let i = 0; i < num_attachments; i++) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0,
                    gl.RED, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, tex, 0);
    attachments.push(gl.COLOR_ATTACHMENT0 + i);
    textures.push(tex);
  }

  gl.drawBuffers(attachments);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fb, textures };
}
function createRGBABuffer(gl, width, height) {
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  const texture = gl.createTexture();

    gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0,
                    gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fb, texture };
}






async function init(gl, width, height) {
  internal_width = width * 2.0;
  internal_height = height * 2.0;
if (!gl.getExtension('EXT_color_buffer_half_float')) {
  console.error('HALF_FLOAT color attachments not supported on this device!');
}
  // === LOAD SHADERS ===
  const vsSource = await loadShaderSource("vertex.glsl");

  const fsGBuffer = await loadShaderSource("fragment_simplex.glsl");
  const fsSmoothH  = await loadShaderSource("fragment_horizontal_blur.glsl");
  const fsSmoothV  = await loadShaderSource("fragment_vertical_blur.glsl");
  const fsLight   = await loadShaderSource("fragment_final.glsl");

  // === CREATE PROGRAMS ===
  const programGBuffer = createProgram(gl, vsSource, fsGBuffer);
  const programSmoothHorizontal  = createProgram(gl, vsSource, fsSmoothH);
  const programSmoothVertical  = createProgram(gl, vsSource, fsSmoothV);
  const programLight   = createProgram(gl, vsSource, fsLight);

  // === FULLSCREEN QUAD ===
  const positions = new Float32Array([
    -1, -1,  1, -1,  -1, 1,
    -1,  1,  1, -1,   1, 1
  ]);
  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

  // === FBOs ===
  const gBuffer = createBuffer(gl, internal_width, internal_height, 3);
  const aoSmoothH = createBuffer(gl, internal_width, internal_height, 1);
  const aoSmoothV = createBuffer(gl, internal_width, internal_height, 1);
  const finalHighResBuffer = createRGBABuffer(gl, internal_width, internal_height);

  // === STORE EVERYTHING ===
  gl._pipeline = {
    width, height,
    programGBuffer, 
    programSmoothHorizontal,
    programSmoothVertical, 
    programLight,
    positionBuffer,
    gBuffer, 
    aoSmoothH,
    aoSmoothV,
    finalHighResBuffer
  };

  gl.clearColor(0.0, 0.0, 0.0, 1.0);
}
function checkFramebuffer(gl, name) {
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    console.warn(name, 'incomplete!', status.toString(16));
  }
}
function render(gl, parameters, type, rotationMatrix, size, stimulus) {
  const {
    width, height,
    programGBuffer, 
    programSmoothHorizontal,
    programSmoothVertical, 
    programLight,
    positionBuffer,
    gBuffer, 
    aoSmoothH,
    aoSmoothV,
    finalHighResBuffer
  } = gl._pipeline;

  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

  // === Helper for setting up attribute ===
  function bindQuadAttrib(program) {
    const loc = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }

  // ========== PASS 1: G-BUFFER ==========
  // Higher resolution for super sampling
  internal_width = width * 2;
  internal_height = height * 2;
  gl.bindFramebuffer(gl.FRAMEBUFFER, gBuffer.fb);
  checkFramebuffer(gl, 'gBuffer');
  gl.viewport(0, 0, internal_width, internal_height);
  gl.useProgram(programGBuffer);
  bindQuadAttrib(programGBuffer);

  gl.uniform1f(gl.getUniformLocation(programGBuffer, "u_frequency"), parameters[0]);
  gl.uniform1f(gl.getUniformLocation(programGBuffer, "u_amplitude"), parameters[1]);
  gl.uniformMatrix3fv(gl.getUniformLocation(programGBuffer, "u_rotation"), false, rotationMatrix);
  gl.uniform1i(gl.getUniformLocation(programGBuffer, "u_type"), type);
  gl.uniform1f(gl.getUniformLocation(programGBuffer, "u_size"), size);
  gl.uniform1i(gl.getUniformLocation(programGBuffer, "u_stimulus"), stimulus);

  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  // ========== PASS 2: AO SMOOTH Horizontal ==========
  gl.bindFramebuffer(gl.FRAMEBUFFER, aoSmoothH.fb);
  gl.viewport(0, 0, internal_width, internal_height);
  gl.useProgram(programSmoothHorizontal);
  bindQuadAttrib(programSmoothHorizontal);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, gBuffer.textures[1]); // AO tex
  gl.uniform1i(gl.getUniformLocation(programSmoothHorizontal, "u_aoTex"), 0);
  gl.uniform2f(gl.getUniformLocation(programSmoothHorizontal, "u_texelSize"), 1/internal_width, 1/internal_height);

  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  // ========== PASS 2: AO SMOOTH vertical ==========
  gl.bindFramebuffer(gl.FRAMEBUFFER, aoSmoothV.fb);
  gl.viewport(0, 0, internal_width, internal_height);
  gl.useProgram(programSmoothVertical);
  bindQuadAttrib(programSmoothVertical);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, aoSmoothH.textures[0]); // AO tex
  gl.uniform1i(gl.getUniformLocation(programSmoothVertical, "u_aoTex"), 0);
  gl.uniform2f(gl.getUniformLocation(programSmoothVertical, "u_texelSize"), 1/internal_width, 1/internal_height);

  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  // ========== PASS 3: LIGHTING ==========
  gl.bindFramebuffer(gl.FRAMEBUFFER, finalHighResBuffer.fb);
  gl.viewport(0, 0, internal_width, internal_height);
  gl.useProgram(programLight);
  bindQuadAttrib(programLight);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, gBuffer.textures[0]); // position
  gl.uniform1i(gl.getUniformLocation(programLight, "u_diffuseTex"), 0);

  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, aoSmoothV.textures[0]);
  gl.uniform1i(gl.getUniformLocation(programLight, "u_aoTex"), 1);

  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, gBuffer.textures[2]);
  gl.uniform1i(gl.getUniformLocation(programLight, "u_hitTex"), 2);

  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  // Blit to lower resolution for supersampling effect
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, finalHighResBuffer.fb);
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);  // canvas
  gl.blitFramebuffer(
      0, 0, internal_width, internal_height,
      0, 0, width, height,
      gl.COLOR_BUFFER_BIT,
      gl.LINEAR
  );
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
}

let ctxLeft, ctxRight;



// Experiment setup with jsPsych
const jsPsych = initJsPsych(
    {
        display_element: 'jspsych-target',
        show_progress_bar: true,
        on_finish: function(){
window.removeEventListener('beforeunload', beforeUnloadListener);
    window.location.reload();
        }
    }
);


/**
 * A set of simple 3D vector utility functions.
 * Vectors are represented as 3-element arrays: [x, y, z].
 */
const vec3 = {
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],

    cross: (a, b) => [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ],

    subtract: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],

    scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],

    lengthSq: (a) => a[0] * a[0] + a[1] * a[1] + a[2] * a[2],

    normalize: (a) => {
        const len = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
        if (len > 0.00001) {
            return [a[0] / len, a[1] / len, a[2] / len];
        } else {
            return [0, 0, 0];
        }
    },
};

/**
 * Generates a random 3D point inside the unit sphere using rejection sampling.
 * Samples from a [-1, 1] cube and rejects points outside the sphere.
 * @returns {number[]} A 3-element array representing a point [x, y, z].
 */
function getRandomPointInUnitSphere() {
    let p;
    let lenSq;
    do {
        p = [
            Math.random() * 2 - 1, // -1 to 1
            Math.random() * 2 - 1, // -1 to 1
            Math.random() * 2 - 1, // -1 to 1
        ];
        lenSq = vec3.lengthSq(p);
    } while (lenSq >= 1.0 || lenSq === 0); // Keep trying if outside sphere or at the origin
    return p;
}


/**
 * Creates a random 3x3 rotation matrix. 
 * The matrix is returned as a 9-element array in column-major order,
 * suitable for use with WebGL/OpenGL.
 * @returns {number[]} A 9-element array representing a mat3.
 */
function generateRandomRotationMatrix() {
    // Step 1: Rejection sample two points in the unit sphere.
    let p1, p2, p1Norm, p2Norm;
    const epsilon = 0.0001; 
    // We need to ensure the points are not collinear (the same or opposite).
    // We can check this by seeing if the absolute value of the dot product
    // of their normalized versions is close to 1.
    do {
        p1 = getRandomPointInUnitSphere();
        p2 = getRandomPointInUnitSphere();
        
        p1Norm = vec3.normalize(p1);
        p2Norm = vec3.normalize(p2);
        
        // If they are nearly parallel or anti-parallel, regenerate.
    } while (Math.abs(vec3.dot(p1Norm, p2Norm)) > 1.0 - epsilon);

    // Step 2: Normalize p1. This will be the first column (X-axis) of our new basis.
    const c1 = vec3.normalize(p1);

    // Step 3: Project p2 onto the plane orthogonal to p1.
    // This is a classic Gram-Schmidt orthonormalization step.
    // p2' = p2 - projection_of_p2_on_p1
    const projection = vec3.scale(c1, vec3.dot(p2, c1));
    const p2_prime = vec3.subtract(p2, projection);

    // Step 4: Normalize p2'. This is the second column (Y-axis).
    const c2 = vec3.normalize(p2_prime);

    // Step 5: Calculate p3 as the cross product to get the third orthogonal axis (Z-axis).
    // This ensures a right-handed coordinate system.
    const c3 = vec3.cross(c1, c2);

    // Step 6: Assemble the rotation matrix (mat3) in column-major order.
    // The columns of the matrix are our new basis vectors (c1, c2, c3).
    // [ c1.x  c2.x  c3.x ]
    // [ c1.y  c2.y  c3.y ]
    // [ c1.z  c2.z  c3.z ]
    const rotationMatrix = [
        c1[0], c1[1], c1[2],  // Column 1
        c2[0], c2[1], c2[2],  // Column 2
        c3[0], c3[1], c3[2],  // Column 3
    ];

    return rotationMatrix;
}
const frequencies = [4, 6, 10, 16, 25];
const amplitudes = [0.002, 0.006, 0.017, 0.048, 0.14];


function generateStimuli(frequencies, amplitudes){
    const stimuli = [];
    // explicitly include 0
    stimuli.push([0,0]);
    for (let i = 0; i < frequencies.length; i++){
        for (let j = 0; j < amplitudes.length; j++){
            stimuli.push([frequencies[i], amplitudes[j]]);
        }
    }
    return stimuli;
}

const stimuli = generateStimuli(frequencies, amplitudes);

function generatePairs(arr) {
    const pairs = [];
    for (let i = 0; i < arr.length; i++) {
        for (let j = i; j < arr.length; j++) {
            if (Math.random() < 0.5) {
                pairs.push([arr[i], arr[j]]);
            }
            else {
                pairs.push([arr[j], arr[i]]);
            }
            
        }
    }
    return pairs;
}

function shuffleWithRandom(arr) {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

const Pairs = shuffleWithRandom(generatePairs(stimuli));

const likertScale = [
    "Not",
    "Hardly",
    "Slightly",
    "Mildly",
    "Moderately",
    "Quite",
    "Largely",
    "Very",
    "Extremely"
];

const typeMap = {
    0: "sphere",
    1: "box",
    2: "torus",
    3: "cylinder",
    4: "round cone"
};
const typeCount = Object.keys(typeMap).length;

const trials = Pairs.map((pair, index) => {

    const type = Math.floor(Math.random() * typeCount);
    const size = Math.floor(Math.random() * 2) * 0.3 + 0.3;

    const typeString = typeMap[type]
    const rotationMatrix = new Float32Array(generateRandomRotationMatrix());

    return {
        type: jsPsychSurveyLikert,
        questions: [{
            prompt: "How similar are these two images?",
            name: 'similarity',
            labels: likertScale
        }],
        on_start: function () {
            render(ctxLeft, pair[0], type, rotationMatrix, size, 0);
            render(ctxRight, pair[1], type, rotationMatrix, size, 1);
        },
        data: {seed: EXPERIMENT_SEED, objects: typeString, rotation: rotationMatrix, size: size, left: pair[0], right: pair[1]},
        on_load: function () {
            // Hide the continue button
            const btn = document.querySelector('.jspsych-btn');
            if (btn) btn.style.display = 'none';
            // Find all radio inputs (Likert buttons)
            document.querySelectorAll('.jspsych-survey-likert-opts input[type="radio"]').forEach(el => {
                el.addEventListener('click', () => {
                    // Simulate clicking the "Continue" button
                    document.querySelector('#jspsych-survey-likert-next').click();
                });
            });
        },
    };

});

timeline = [];
timeline.push(trials);
document.addEventListener("DOMContentLoaded", async () => {
  ctxLeft = document.getElementById("canvasLeft").getContext("webgl2", {antialias: false});
  ctxRight = document.getElementById("canvasRight").getContext("webgl2", {antialias:false});
  const widthLeft = ctxLeft.drawingBufferWidth;
  const heightLeft = ctxLeft.drawingBufferHeight;
  const widthRight = ctxRight.drawingBufferWidth;
  const heightRight = ctxRight.drawingBufferHeight;

  await Promise.all([
    init(ctxLeft, widthLeft, heightLeft),
    init(ctxRight, widthRight, heightRight)
  ]);
  jsPsych.run(timeline);
});
