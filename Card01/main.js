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
            }
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
        }
    })
})