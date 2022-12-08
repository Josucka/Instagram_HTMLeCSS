THREE.GLTFLoader = (function(){
    function GLTFLoader(manager){
        THREE.Loader.call(this, manager);

        this.dracoLoader = null;
        this.ddsLoader = null;
    }

    GLTFLoader.prototype = Object.assign(Object.create(THREE.Loader.prototype),{
        constructor: GLTFLoader,
        load: function(url, onLoad, onProgress, onError){
            var scope = this;
            var resourcePath;
            
            if(this.resourcePath !== ''){
                resourcePath = this.resourcePath;
            }
            else if(this.path !== ''){
                resourcePath = this.path;
            }
            else{
                resourcePath = THREE.LoaderUtils.extractUrlBase(url);
            }
            
            scope.manager.itemStart(url);
            
            var _onError = function(e){
                if(onError){
                    onError(e);
                }
                else{
                    console.error(e);
                }
                scope.manager.itemError(url);
                scope.manager.itemEnd(url);
            };

            var loader = new THREE.FileLoader(scope.manager);

            loader.setPath(this.path);
            loader.setResponseType('arraybuffer');

            if(scope.crossOrigin === 'use-credentials'){
                loader.setWithCredentials(true);

            }
            loader.load(url, function(data){
                try{
                    scope.parse(data, resourcePath, function(gltf){
                        onLoad(gltf);
                        scope.manager.itemEnd(url);
                    }, _onError);
                }catch(e){
                    _onError(e);
                }
            }, onProgress, _onError);
        },
        setDRACOLoader: function(dracoLoader){
            this.dracoLoader = dracoLoader;
            return this;
        },
        setDRACOLoader: function(ddsLoader){
            this.ddsLoader = ddsLoader;
            return this;
        },
        parse: function(data, path, onLoad, onError){
            var content;
            var extensions = {};

            if(typeof data === 'string'){
                content = data;
            }else{
                var magic = THREE.LoaderUtils.decodeText(new Uint8Array(data, 0, 4));

                if(magic === BINARY_EXTENSION_HEADER_MAGIC){
                    try{
                        extensions[EXTENSIONS.KHR_BINARY_GLTF] = new GLTFBinaryExtension(data);
                    }
                    catch(error){
                        if(onError) onError(error);
                        return;
                    }
                    content = extensions[EXTENSIONS.KHR_BINARY_GLTF].content;
                }else{
                    content = THREE.LoaderUtils.decodeText(new Uint8Array(data));
                }
            }

            var json = JSON.parse(content);

            if(json.asset === undefined || json.asset.version[0] < 2){
                if(onError) onError(new Error('THREE>GLTFLoader: Unsupportd asset. glTF versions >= 2.0 are supported.'));
                return;
            }

            if(json.extensionsUsed){
                for(var i = 0; i < json.extensionsUsed.length; i++){
                    var extensionName = json.extensionsUsed[i];
                    var extensionsRequired = json.extensionsRequired || [];

                    switch(extensionName){
                        case EXTENSIONS.KHR_LIGTHS_PUNCTUAL:
                        extensions[extensionName] = new GLTFLigthsExtension(json);
                        break;
                        
                        case EXTENSIONS.KHR_MATERIALS_UNLIT:
                        extensions[extensionName] = new GLTFMaterialsUnlitExtension();
                        break;
                        
                        case EXTENSIONS.KHR_MATERIALS_PBR_SPECULAR_GLOSSINESS:
                        extensions[extensionName] = new GLTFMaterialsPbrSpecularGlossinessExtension();
                        break;
                        
                        case EXTENSIONS.KHR_DRACO_MESH_COMPRESSION:
                        extensions[extensionName] = new GLTFDracoMeshCompressionExtension(json, this.dracoLoader);
                        break;
                        
                        case EXTENSIONS.MSFT_TEXTURE_DDS:
                        extensions[extensionName] = new GLTFTextureDDSExtension(this.ddsLoader);
                        break;
                        
                        case EXTENSIONS.KHR_TEXTURE_TRANSFORM:
                        extensions[extensionName] = new GLTFTextureTransfomExtension();
                        break;
                        
                        case EXTENSIONS.KHR_MESH_QUANTIZATION:
                        extensions[extensionName] = new GLTFMeshQuantizationExtension();
                        break;

                        default:
                            if(extensionsRequired.indexOf(extensionName) >= 0){
                                console.warn('THREE.GLTFLoader: Unknown extension "'+ extensionName +'".');
                            }
                    }
                }
            }
            var parser = new GLTFParse(json, extensions, {
                path: path || this.resourcePath || '',
                crossOrigin: this.crossOrigin,
                manager: this.constructor.manager
            });
            parser.parse(onLoad, onError);
        }
    });

    function GLTFRegistry(){
        var objects = {};

        return {
            get: function(key){
                return objects[key];
            },
            add: function(key, object){
                objects[key] = object;
            },
            remove: function(key){
                delete objects[key];
            },
            removeAll: function(key){
                objects = {};
            }
        };
    }
})

var EXTENSIONS = {
    KHR_BINARY_GLTF: 'KHR_binary_glTF',
    KHR_DRACO_MESH_COMPRESSION: 'KHR_draco_mesh_compression',
    KHR_LIGTHS_PUNCTUAL: 'KHR_ligths_punctual',
    KHR_MATERIALS_PBR_SPECULAR_GLOSSINESS: 'KHR_materials_pbrSpecularGlossines',
    KHR_MATERIALS_UNLIT: 'KHR_materials_unlit',
    KHR_TEXTURE_TRANSFORM: 'KHR_texture_transform',
    KHR_MESH_QUANTIZATION: 'KHR_mesh_quartization',
    MSFT_TEXTURE_DDS: 'MSFT_texture_dds'
};

function GLTFTextureDDSExtension(ddsLoader){
    if(!ddsLoader){
        throw new Error('THREE.GLTFLoader: Attempting to load .dds texture without importing THREE.DDSLoader');
    }
    this.name = EXTENSIONS.MSFT_TEXTURE_DDS;
    this.ddsLoader = ddsLoader;
}

function GLTFLigthsExtension(json){
    this.name = EXTENSIONS.KHR_LIGTHS_PUNCTUAL;

    var extension = (json.extensions && json.extensions[EXTENSIONS.KHR_LIGTHS_PUNCTUAL]) || {};
    this.lightDefs = extension.lights || [];
}

GLTFLigthsExtension.prototype.loadLight = function(lightIndex){
    var lightDef = this.lightDefs[lightIndex];
    var lightNode;
    var color = new THREE.Color(0xffffff);
    
    if(lightDef.type) color.fromArray(lightDef.color);

    var range = lightDef.range !== undefined ? lightDef.range : 0;

    switch (lightDef.type) {
        case 'directional':
            lightNode = new THREE.DirectionalLight(color);
            lightNode.target.position.set(0, 0, -1);
            lightNode.add(lightNode.target);
            break;
        case 'point':
            lightNode = new THREE.PointLight(color);
            lightNode.distance = range;
            break;
        case 'spot':
            lightNode = new THREE.SpotLight(color);
            lightNode.distance = range;

            lightDef.spot = lightDef.spot || {};
            lightDef.spot.innerConeAngle = lightDef.spot.innerConeAngle !== undefined ? lightDef.spot.innerConeAngle : 0;
            lightDef.spot.outerConeAngle = lightDef.spot.outerConeAngle !== undefined ? lightDef.spot.outerConeAngle : Math.PI / 4.0;
            lightNode.angle = lightDef.spot.outerConeAngle;
            lightNode.penumbra = 1.0 - lightDef.spot.innerConeAngle / lightDef.spot.outerConeAngle;
            lightNode.target.position.set(0, 0, -1);
            lightNode.add(lightNode.target);
    
            break;
    
        default:
            throw new Error('THREE.GLTFLoader: Unexpected light type, "' + lightDef.type +'".');
            break;
    }

    lightNode.position.set(0, 0, 0);
    lightNode.decay = 2;

    if(lightDef.intensity !== undefined) lightNode.intensity = lightDef.intensity;

    lightNode.name = lightDef.name || ('light_' + lightIndex);

    return Promise.resolve(lightNode);
};

function GLTFMaterialsUnlitExtension(){
    this.name = EXTENSIONS.KHR_MATERIALS_UNLIT;
};

GLTFMaterialsUnlitExtension.prototype.getMaterialType = function(){
    return THREE.MeshBasicMaterial;
};

GLTFMaterialsUnlitExtension.prototype.extendParams = function(materialParams, materialDef, parser){
    var pending = [];

    materialParams.color = new THREE.Color(1.0, 1.0, 1.0);
    materialParams.opacity = 1.0;

    var metallicRoughness = materialDef.pbrMetallicRoughness;

    if(metallicRoughness){
        if(Array.isArray(metallicRoughness.baseColorFactor)){
            var array = metallicRoughness.baseColorFactor;

            materialParams.color.fromArray(array);
            materialParams.opacity = array[3];
        }

        if(metallicRoughness.baseColorTexture !== undefined){
            pending.push(parser.assignTexture(materialParams, 'map', metallicRoughness.baseColorTexture));
        }
    }

    return Promise.all(pending);
};

var BINARY_EXTENSION_HEADER_MAGIC = 'glTF';
var BINARY_EXTENSION_HEADER_LENGTH = 12;
var BINARY_EXTENSION_CHUNK_TYPES = {JSON: 0x4E4F534A, BIN: 0x004E4942};

function GLTFBinaryExtension(data){
    this.name = EXTENSIONS.KHR_BINARY_GLTF;
    this.content = null;
    this.body = null;

    var headerView = new DataView(data, 0, BINARY_EXTENSION_HEADER_LENGTH);

    this.header = {
        magic: THREE.LoaderUtils.decodeText(new Uint8Array(data.slice(0, 4))),
        version: headerView.getUint32(4, true),
        length: headerView.getUint32(8, true)
    };

    if(this.header.magic !== BINARY_EXTENSION_HEADER_MAGIC){
        throw new Error('THREE.GLTFLoader: Unsupported glTF-Binary header.');
    }else if(this.header < 2.0){
        throw new Error('THREE.GLTFLoader: Legacy binary file detected.');
    }

    var chunkView = new DataView(data, BINARY_EXTENSION_HEADER_LENGTH);
    var chunkIndex = 0;

    while (chunkIndex < chunkView.byteLength) {
        var chunkLenght = chunkView.getUint32(chunkIndex, true);
        chunkIndex += 4;
        
        var chunkType = chunkView.getUint32(chunkIndex, true);
        chunkIndex += 4;

        if(chunkType === BINARY_EXTENSION_CHUNK_TYPES.JSON){
            var contentArray = new Uint8Array(data, BINARY_EXTENSION_HEADER_LENGTH + chunkIndex, chunkLenght);
            this.content = THREE.LoaderUtils.decodeText(contentArray);
        }else if(chunkType == BINARY_EXTENSION_CHUNK_TYPES.BIN){
            var byteOffset = BINARY_EXTENSION_HEADER_LENGTH + chunkIndex;
            this.body = data.slice(byteOffset, byteOffset + chunkLenght);
        }

        chunkIndex += chunkLenght;
    }

    if(this.content === null){
        throw new Error('THREE.GLTFLoader: JSON content not found.');
    }
}

function GLTFDracoMeshCompressionExtension(json, dracoLoader){
    if(!dracoLoader){
        throw new Error('THREE.GLTFLoader: No DRACOLoader instance provided.');
    }

    this.name = EXTENSIONS.KHR_DRACO_MESH_COMPRESSION;
    this.json = json;
    this.dracoLoader = dracoLoader;
    this.dracoLoader.preload();
}

GLTFDracoMeshCompressionExtension.prototype.decodePrimitive = function(primitive, parser){
    var json = this.json;
    var dracoLoader = this.dracoLoader;
    var bufferViewIndex = primitive.extensions[this.name].bufferView;
    var gltfAttributeMap = primitive.extensions[this.name].attributes;
    var threeAttrinuteMap = {};
    var attributeNormalizedMap = {};
    var attributeTypeMap = {};

    for(var attributeName in gltfAttributeMap){
        var threeAttrinuteName = ATTRIBUTES[attributeName] || attributeName.toLowerCase();

        threeAttrinuteMap[threeAttrinuteName] = gltfAttributeMap[attributeName];
    }

    for(attributeName in primitive.attributes){
        var threeAttrinuteName = ATTRIBUTES[attributeName] || attributeName.toLowerCase();

        if(gltfAttributeMap[attributeName] !== undefined){
            var accessorDef = json.accessors[primitive.attributes[attributeName]];
            var componetType = WEBGL_COMPONENT_TYPES[accessorDef.componetType];

            attributeTypeMap[threeAttrinuteName] = componetType;
            attributeNormalizedMap[threeAttrinuteName] = accessorDef.normalized === true;
        }
    }

    return parser.getDependency('bufferView', bufferViewIndex).then(function(bufferView){
        return new Promise(function(resolve){
            dracoLoader.decodeDracoFile(bufferView, function(geometry){
                for(var attributeName in geometry.attributes){
                    var attribute = geometry.attributes[attributeName];
                    var normalized = attributeNormalizedMap[attributeName];

                    if(normalized !== undefined) attribute.normalized = normalized;
                }
                resolve(geometry);
            }, threeAttrinuteMap, attributeTypeMap);
        });
    });
};

function GLTFTextureTransfomExtension() {
    this.name = EXTENSIONS.KHR_TEXTURE_TRANSFORM;
}

GLTFTextureTransfomExtension.prototype.extendTexture = function(texture, transform){
    texture = texture.clone();

    if(transform.offset !== undefined){
        texture.offset.fromArray(transform.offset);
    }

    if(transform.rotation !== undefined){
        texture.rotation = transform.rotation;
    }

    if(transform.scale !== undefined){
        texture.repeat.fromArray(transform.scale);
    }

    if(transform.texCoord !== undefined){
        console.warn('THREE.GLTFLoader: Custom UV sets in "'+ this.name + '" extension not yet supported.');
    }

    texture.needsUpdate = true;
    return texture;
};

function GLTFMaterialsPbrSpecularGlossinessExtension(){
    return{
        name: EXTENSIONS.KHR_MATERIALS_PBR_SPECULAR_GLOSSINESS, specularGlossinessParams:[
            'color',
            'map',
            'lightMap',
            'lightMapIntensity',
            'aoMap',
            'aoMapIntensity',
            'emissive',
            'emissiveIntensity',
            'emissiveMap',
            'bumpMap',
            'bumpScale',
            'normalMap',
            'displacementMap',
            'displacementScale',
            'displacemntBias',
            'specularMap',
            'specular',
            'glossinessMap',
            'glossiness',
            'alphaMap',
            'envMap',
            'envMapIntensity',
            'refractionRatio'
        ],
        getMaterialType: function(){
            return THREE.ShaderMaterial;
        },
        extendParams: function (materialParams, materialDef, parser) {
            var pbrSpecularGlossiness = materialDef.extensions[this.name];
            var shader = THREE.shaderLib['standard'];
            var specularMapParsFragmentChunk = [
                '#ifdef USE_SPECULARMAP',
                'uniform sampler2D specularMap;',
                '#endif'
            ].join('\n');
            var specularMapFragmentChunk = [
                'vec3 specularFactor = specular;',
                '#ifdef USE_SPECULARMAP',
                'vec4 texelSpecular = texture2D(specularMap, vUv);',
                'texelSpecular = sRGBToLinear(texelSpecular);',
                '// reads channel RGB, compatible with a glTF Specular-Glossiness (RGBA) texture',
                'specularFactor *= texelSpecular.rgb;',
                '#endif'
            ].join('\n');
            var glossinessMapFragmentChunk = [
                'float glossinessFactor = glossiness;',
                '#ifdef USE_GLOSSINESSMAP',
                'vec4 texelGlossiness = texture2D(glossinessMap, vUv);',
                '// reads channel A, compatible with a glTF Specular-Glossiness (RGBA) texture',
                'glossinessFactor *= texelGlossiness.a',
                '#endif'
            ].join('\n');
            var lightPhysicalFragmentChunk = [
                'PhysicalMaterial material;',
                'material.diffuseColor = diffuseColor.rgb;',
                'material.specularRoughness = clamp(1.0 - glossinessFactor, 0.04, 1.0);',
                'material.specularColor = specularFactor.rgb;'
            ].join('\n');
            var fragmentShader = shader.fragmentShader.replace(
                'uniform float roughness;',
                'uniform vec3 specular;'
            ).replace(
                'uniform float metalness;',
                'uniform float glossiness;'
            ).replace(
                '#include <roughnessmap_pars_fragment>',
                specularMapParsFragmentChunk
            ).replace(
                '#include <metalnessmap_pars_fragment>',
                glossinessMapFragmentChunk
            ).replace(
                '#include <roughnessmap_fragment>',
                specularMapFragmentChunk
            ).replace(
                '#include <metalnessmap_fragment>',
                glossinessMapFragmentChunk
            ).replace(
                '#include <lights_pysical_fragment>',
                lightPhysicalFragmentChunk
            );

            delete uniforms.roughness;
            delete uniforms.metalness;
            delete uniforms.roughnessMap;
            delete uniforms.metalnessMap;

            uniforms.specular = {value: new THREE.Color().setHex(0x111111)};
            uniforms.glossiness = {value: 0.5};
            uniforms.specularMap = {value: null};
            uniforms.glossinessMap = {value: null};

            materialParams.vertexShader = shader.vertexShader;
            materialParams.fragmentShader = fragmentShader;
            materialParams.uniforms = uniforms;
            materialParams.defines = {'STANDARD': ''};
            materialParams.color = new THREE.Color(1.0, 1.0, 1.0);
            materialParams.opacity = 1.0;

            var pending = [];

            if(Array.isArray(pbrSpecularGlossiness.diffuseFactor)){
                var array = pbrSpecularGlossiness.diffuseFactor;

                materialParams.color.fromArray(array);
                materialParams.opacity = array[3];
            }

            if(pbrSpecularGlossiness.diffuseTexture !== undefined){
                pending.push(parser.assignTexture(materialParams, 'map', pbrSpecularGlossiness.diffuseTexture));
            }

            materialParams.emissive = new THREE.Color(0.0, 0.0, 0.0);
            materialParams.glossiness = pbrSpecularGlossiness.glossinessFactor !== undefined ? pbrSpecularGlossiness.glossinessFactor : 1.0;
            materialParams.specular = new THREE.Color(1.0, 1.0, 1.0);

            if(Array.isArray(pbrSpecularGlossiness.specularFactor)){
                materialParams.specular.fromArray(pbrSpecularGlossiness.specularFactor);
            }

            if(pbrSpecularGlossiness.specularGlossinessTexture !== undefined){
                var specGlossinessMapDef = pbrSpecularGlossiness.specularGlossinessTexture;
                pending.push(parser.assignTexture(materialParams, 'glossinessMap', specGlossinessMapDef));
            }

            return Promise.all(pending);
        },
        createMaterial: function(params){
            var material = new THREE.ShaderMaterial({
                defines: params.defines,
                vertexShader: params.vertexShader,
                fragmentShader: params.fragmentShader,
                uniforms: params.uniforms,
                fog: true,
                lights: true,
                opacity: params.opacity,
                transparent: params.transparent
            });

            material.isGLTFSpecularGlossinessMaterial = true;
            material.color = params.color;
            material.map = params.map === undefined ? null : params.map;
            material.lightMap = null;
            material.lightMapIntensity = 1.0;
            material.aoMap = params.aoMap === undefined ? null : params.aoMap;
            material.aoMapIntensity = 1.0;
            material.emissive = params.emissive;
            material.emissiveIntensity = 1.0;
            material.emissiveMap = params.emissiveMap === undefined ? null : params.emissiveMap;
            material.bumpMap = params.bumpMap === undefined ? null : params.bumpMap;
            material.bumpScale = 1;
            material.normalMap = params.normalMap == undefined ? null : params.normalMap;
            
            if(params.normalScale) material.normalScale = params.normalScale;

            material.displacementMap = null;
            material.displacementScale = 1;
            material.displacementBias = 0;
            material.specularMap = params.specularMap === undefined ? null : params.specularMap;
            material.specular = params.specular;
            material.glossinessMap = params.glossinessMap === undefined ? null : params.glossinessMap;
            material.glossiness = params.glossiness;
            material.alphaMap = null;
            material.envMap = params.envMap === undefined ? null : params.envMap;
            material.envMapIntensity = 1.0;
            material.refractionRatio = 0.98;
            material.extensions.derivatives = true;

            return material;
        },
        cloneMaterial: function(source){
            var target = source.clone();

            target.isGLTFSpecularGlossinessMaterial = true;

            var params = this.specularGlossinessParams;

            for(var i = 0, il = params.length; i < il; i++){
                var value = source[params[i]];

                target[params[i]] = (value && value.isColor) ? value.clone() : value;
            }

            return target;
        },
        refreshUniforms: function (renderer, scene, camara, geometry, material) {
            if(material.isGLTFSpecularGlossinessMaterial !== true){
                return;
            }

            var uniforms = material.uniforms;
            var defines = material.defines;

            uniforms.opacity.value = material.opacity;
            uniforms.diffuse.value.copy(material.color);
            uniforms.emissive.value.copy(material.emissive).multiplyScalar(material.emissiveIntensity);
            uniforms.map.value = material.map;
            uniforms.specularMap.value = material.specularMap;
            uniforms.alphaMap.value = material.alphaMap;
            uniforms.lightMap.value = material.lightMap;
            uniforms.lightMapIntensity.value = material.lightMapIntensity;
            uniforms.aoMap.value = material.aoMap;
            uniforms.aoMapIntensity.value = material.aoMapIntensity;

            var uvScaleMap;

            if(material.map){
                uvScaleMap = material.map;
            }else if(material.specularMap){
                uvScaleMap = material.specularMap;
            }else if(material.displacementMap){
                uvScaleMap = material.displacementMap;
            }else if(material.normalMap){
                uvScaleMap = material.normalMap;
            }else if(material.bumpMap){
                uvScaleMap = material.bumpMap;
            }else if(material.glossinessMap){
                uvScaleMap = material.glossinessMap;
            }else if(material.alphaMap){
                uvScaleMap = material.alphaMap;
            }else if(material.emissiveMap){
                uvScaleMap = material.emissiveMap;
            }

            if(uvScaleMap !== undefined){
                if(uvScaleMap.isWebGLRenderTarget){
                    uvScaleMap = uvScaleMap.texture;
                }

                if(uvScaleMap.matrixAutoUpdate === true){
                    uvScaleMap.updateMatrix();
                }

                uniforms.uvTransform.value.copy(uvScaleMap.matrix);
            }

            if(material.envMap){
                uniforms.envMap.value = material.envMap;
                uniforms.envMapIntensity.value = material.envMapIntensity;
                uniforms.flipEnvMap.Value = material.envMap.isCubeTexture ? -1 : 1;
                uniforms.reflectivity.value = material.reflectivity;
                uniforms.refractionRatio.value = material.refractionRatio;
                uniforms.maxMipLevel.value = renderer.properties.get(material.envMap)._maxMipLevel;
            }

            uniforms.specular.value.copy(material.specular);
            uniforms.glossiness.value = material.glossiness;
            uniforms.glossinessMap.value = material.glossinessMap;
            uniforms.bumpMap.value = material.bumpMap;
            uniforms.normalMap.value = material.normalMap;
            uniforms.displacementMap.value = material.displacementMap;
            uniforms.displacementScale.value = material.displacementScale;
            uniforms.displacementBias.value = material.displacementBias;

            if(uniforms.glossinessMap.value !== null && defines.USE_GLOSSINESSMAP !== undefined){
                delete defines.USE_GLOSSINESSMAP;
                delete defines.USE_ROUGHNESSMAP;
            }
        }
    };
}

function GLTFMeshQuantizationExtension(){
    this.name = EXTENSIONS.KHR_MESH_QUANTIZATION;
}

function GLTFCubicSplineInterpolant(parameterPositions, sampleValues, sampleSize, resultBuffer){
    THREE.Interpolant.call(this, parameterPositions, sampleValues, sampleSize, resultBuffer);
}

GLTFCubicSplineInterpolant.prototype = Object.create(THREE.Interpolant.prototype);
GLTFCubicSplineInterpolant.prototype.constructor = GLTFCubicSplineInterpolant;

GLTFCubicSplineInterpolant.prototype.copySampleValue_ = function(index){
    var result = this.resultBuffer,
        values = this.sampleValues,
        valueSize = this.valueSize,
        offset = index * valueSize * 3 + valueSize;


    for(var i = 0; i !== valueSize; i++){
        result[i] = values[offset + i];
    }

    return result;
};

GLTFCubicSplineInterpolant.prototype.beforeStart_ = GLTFCubicSplineInterpolant.prototype.copySampleValue_;
GLTFCubicSplineInterpolant.prototype.afterEnd_ = GLTFCubicSplineInterpolant.prototype.copySampleValue_;

GLTFCubicSplineInterpolant.prototype.interpolate_ = function(i1, t0, t, t1){
    var result = this.resultBuffer;
    var values = this.sampleValues;
    var stride = this.valueSize;
    var stride2 = stride * 2;
    var stride3 = stride * 3;
    var td = t1 - t0;
    var p = (t - t0) / td;
    var pp = p * p;
    var ppp = pp * p;
    var offset1 = i1 * stride3;
    var object0 = offset1 - stride3;
    var s2 = -2 * ppp + 3 * pp;
    var s3 = ppp - pp;
    var s0 = 1 - s2;
    var s1 = s3 - pp + p;

    for(var i = 0; i !== stride; i++){
        var p0 = values[offset0 + i + stride];
        var m0 = values[offset0 + i + stride2] * td;
        var p1 = values[offset1 + i + stride];
        var m1 = values[offset1 + i] * td;
        result[i] = s0 * p0 + s1 * m0 + s2 * p1 + s3 * m1;
    }

    return result;
};

var WEBGL_CONSTANTS = {
    FLOAT: 5126,
    FLOAT_MAT3: 35675,
    FLOAT_MAT4: 35676,
    FLOAT_VEC2: 35664,
    FLOAT_VEC3: 35665,
    FLOAT_VEC4: 35666,
    LINEAR: 9729,
    REPEAT: 10497,
    SAMPLER_2D: 35678,
    POINTS: 0,
    LINES: 1, 
    LINE_LOOP: 2,
    LINE_STRIP: 3,
    TRIANGLES: 4,
    TRIANGLE_STRIP: 5,
    TRIANGLE_FAN: 6,
    UNSIGNED_BYTE: 5121,
    UNSIGNED_SHORT: 5123
};

var WEBGL_COMPONENT_TYPES = {
    5120: Int8Array,
    5121: Uint8Array,
    5122: Int16Array,
    5123: Uint16Array,
    5125: Uint32Array,
    5126: Float32Array
};

var WEBGL_FILTERS = {
    9728: THREE.NearestFilter,
    9729: THREE.LinearFilter,
    9984: THREE.NearestMipmapNearestFilter,
    9985: THREE.LinearMipmapNearestFilter,
    9986: THREE.NearestMipmapLinearFilter,
    9987: THREE.LinearMipmapLinearFilter
};

var WEBGL_WRAPPINGS = {
    33071: THREE.ClampToEdgeWrapping,
    33648: THREE.MirroredRepeatWrapping,
    10497: THREE.REapeatWrapping
};

var WEBGL_TYPES_SIZES = {
    'SCALAR': 1,
    'VEC2': 2,
    'VEC3': 3,
    'VEC4': 4,
    'MAT2': 4,
    'MAT3': 9,
    'MAT4': 16
};

var ATTRIBUTES = {
    POSITION: 'position',
    NORMAL: 'normal',
    TANGENT: 'tangent',
    TEXCOORD_0: 'uv',
    TEXCOORD_1: 'uv2',
    COLOR_0: 'color',
    WEIGHTS_0: 'skinWeight',
    JOINTS_0: 'skinIndex'
};

var PATH_PROPERTIES = {
    scale: 'scale',
    translation: 'position',
    rotatio: 'quarternion',
    weights: 'morphTargetInfluences'
};

var INTERPOLATION = {
    CUBICSPLINE: undefined,
    LINEAR: THREE.InterpolanteLinear,
    STEP: THREE.InterpolanteDiscrete
};

var ALPHA_MODES = {
    OPAQUE: 'OPAQUE',
    MASK: 'MASK',
    BLEND: 'BLEND'
};

var MIME_TYPE_FORMATS = {
    'image/png': THREE.RGBAFormat,
    'image/jpeg': THREE.RGBAFormat
};

function resolveURL(url, path){
    if(typeof url !== 'string' || url === '') return '';

    if(/^https?:\/\//i.test(path) && /^\//.test(url)){
        path = path.replace(/(^https?:\/\/[^\/]+).*/i, '$1');
    }

    if(/^(https?:)?\/\//i.test(url)) return url;

    if(/^data:.*,.*$/i.test(url)) return url;
    
    if(/^blob:.*$/i.test(url)) return url;

    return path + url;
}

function createDefautMaterial(cache){
    if(cache['DefaultMaterial'] === undefined){
        cache['DefaultMaterial'] = new THREE.MeshStandardMaterial({
            color: 0xFFFFFF,
            emissive: 0x000000,
            metalness: 1,
            roughness: 1,
            transparent: false,
            depthTest: true,
            side: THREE.FrontSide
        });
    }

    return cache['DefaultMaterial'];
}

function addUnknownExtendionsToUserData(knownExtensions, object, objectDef){
    for(var name in objectDef.extensions){
        if(knownExtensions[name] === undefined){
            object.userData.gltfExtensions = object.userData.gltfExtensions || {};
            object.userData.gltfExtensions[name] = objectDef.extensions[name];
        }
    }
}

function assignExtrasToUserData(object, gltfDef) {
    if(gltfDef.extras !== undefined){
        if(typeof gltfDef.extras === 'object'){
            Object.assign(object.userData, gltfDef.extras);
        }else{
            console.warn('THREE.GLTFLoader: Ignoring primitive type .extras, ' + gltfDef.extras);
        }
    }
}

// line 1268 continua