#version 300 es
precision highp float;
precision highp int;

in vec2 v_uv;

layout(location = 0) out float outDiffuse;
layout(location = 1) out float outAO;
layout(location = 2) out float outHit;

uniform float u_frequency;
uniform float u_amplitude;
uniform mat3 u_rotation;
uniform int u_type;
uniform int u_stimulus;
uniform float u_size;
const float tilt = radians(93.2);
const float slant = radians(33.9);
const vec3 lightDir =
    vec3(cos((tilt)) * sin(slant), sin(tilt) * sin(slant), cos(slant));
const float ASPECT = 1.0;
const float EPSILON = 0.001;
const float PI = 3.14159265359;
const float CAMERA_DISTANCE = 3.5;
const float ROUNDING_RADIUS = 0.0; // 0.05 * u_size
const float MIN_STEP_SIZE = EPSILON * 0.1;
const float SCALE_STEP_SIZE = 0.1;
const int MAX_STEPS = 1500;

float noisySceneSDF(vec3 p, float r, out vec3 noiseGradient);
#include "primitives.glsl"
#include "psrdnoise3.glsl"

#include "ambient_occlusion.glsl"

// Add noise to distance value
float addNoise(vec3 pos, float uncertainty, out vec3 gradient) {
  float noise;
  noise =
      psrdnoise(pos * u_frequency + vec3(u_stimulus), vec3(0), 0.0, gradient);
  gradient *=
      u_amplitude * uncertainty *
      u_frequency; // NOTE: need to multiply by frequency (inner derivative)

  return noise * u_amplitude * uncertainty;
}

// --- SDF ---
float sceneSDF(vec3 p, float r) {
  if (u_type == 0) {
    return sdSphere(p, r);
  } else if (u_type == 1) {
    float edge_length = (u_size + ROUNDING_RADIUS) / sqrt(3.0);
    return sdRoundBox(p, vec3(edge_length), ROUNDING_RADIUS);
  } else if (u_type == 2) {
    float x = 0.5;
    float rad = u_size / (1.0 + x);
    return sdTorus(p, vec2(rad, x * rad));
  } else if (u_type == 3) {
    float rad = u_size * 0.3;
    float half_height = sqrt(u_size * u_size - rad * rad);

    return sdRoundedCylinder(p, rad, ROUNDING_RADIUS, half_height);
  } else {
    float rad = u_size * 0.5;
    float height = 2.0 * u_size - rad;
    //  Center cone at origin
    vec3 pos = p;
    pos.y += height * 0.5;

    return sdRoundCone(pos, ROUNDING_RADIUS, rad, height);
  }
}

float noisySceneSDF(vec3 p, float r, out vec3 noiseGradient) {
  float dist = sceneSDF(p, r);
  dist += addNoise(p, 1.0, noiseGradient);
  return dist;
}

// --- Normal estimation using central difference ---
vec3 estimateNormal(vec3 p, vec3 noiseGradient) {
  float eps = 0.001;
  vec3 gradient;

  // Estimate base object gradient numerically, but use analytic noise Gradient
  gradient.x = sceneSDF(p + vec3(eps, 0, 0), u_size) -
               sceneSDF(p - vec3(eps, 0, 0), u_size);
  gradient.y = sceneSDF(p + vec3(0, eps, 0), u_size) -
               sceneSDF(p - vec3(0, eps, 0), u_size);
  gradient.z = sceneSDF(p + vec3(0, 0, eps), u_size) -
               sceneSDF(p - vec3(0, 0, eps), u_size);
  gradient = normalize(gradient);
  return normalize(gradient + noiseGradient);
}

float diffuse(vec3 p, vec3 normal, vec3 eyePos) {
  vec3 viewDir = normalize(eyePos - p);
  vec3 reflectDir = reflect(-lightDir, normal);

  float diffuseFactor = max(dot(normal, lightDir), 0.0);

  return diffuseFactor;
}

void main() {
  vec2 uv = v_uv * 2.0 - 1.0;
  // orthographic projection
  vec3 dir = vec3(0.0, 0.0, -1.0);
  vec3 rayOrigin = vec3(uv * vec2(ASPECT, 1.0), CAMERA_DISTANCE);

  // --- Raymarching loop ---
  float rayDepth = 0.0;
  float dist;
  vec3 pos;
  bool hit = false;

  mat3 rotation = u_rotation;
  mat3 invRotation = transpose(u_rotation); // orthogonal matrix
  vec3 localOrigin = invRotation * rayOrigin;
  vec3 localDir = invRotation * dir;
  vec3 noiseGradient;

  for (int i = 0; i < MAX_STEPS; i++) {
    pos = localOrigin + rayDepth * localDir;

    dist = noisySceneSDF(pos, u_size, noiseGradient) * 0.5;
    if (dist < EPSILON) {
      hit = true;
      break;
    }
    if (dist < EPSILON + 1.5 * u_amplitude) {
      dist *= SCALE_STEP_SIZE;
      dist = max(dist, MIN_STEP_SIZE);
    }
    rayDepth += dist;

    if (rayDepth > 30.0)
      break;
  }

  vec3 color = vec3(0.029); // gamma corrected 0.2
  outAO = 0.0;
  outDiffuse = 0.0;
  outHit = 0.0;

  if (hit) {
    vec3 worldPos = rotation * pos;
    vec3 localNormal = estimateNormal(pos, noiseGradient);
    vec3 worldNormal = rotation * localNormal;
    outDiffuse = diffuse(worldPos, worldNormal, rayOrigin);
    outAO = rayTracedAO(pos, localNormal);
    outHit = 1.0;
  }
}
