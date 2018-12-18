'use strict';

const gulp = require('gulp');
const build = require('@microsoft/sp-build-web');
build.addSuppression(`Warning - [sass] The local CSS class 'ms-Grid' is not camelCase and will not be type-safe.`);

const buildPugFromVue = () => {
    const through = require('through2');
    const compiler = require('vue-template-compiler');
    const pug = require('pug');

    // ファイルごとに処理する
    const transform = (file, encode, callback) => {
        // Vueの単一ファイル形式
        let sfcString = file.contents.toString()
        // Vueの単一ファイル形式を分解
        // https://github.com/vuejs/vue/tree/dev/packages/vue-template-compiler#compilerparsecomponentfile-options
        let parsed = compiler.parseComponent(sfcString)

        // テンプレートのみ取り出す
        let templateStr = parsed.template.content
        // Pug -> HTML 変換
        let htmlStr = pug.compile(templateStr)()

        // Vueの単一ファイル形式のうち，Template内を差し替える
        let regex = /<template lang="pug">(.*\n)*?<\/template>/g;
        let newSfcString = sfcString.replace(regex, '<template>' + htmlStr + '</template>')
        file.contents = Buffer.from(newSfcString);

        callback(null, file)
    }
    const th2 = through.obj(transform)
    return th2
}

let copyVueFiles = build.subTask('copy-vue-files', function (gulp, buildOptions, done) {
    return gulp.src(['src/**/*.vue'])
        .pipe(buildPugFromVue())
        .pipe(gulp.dest(buildOptions.libFolder))
});
build.task('build-pug', copyVueFiles);
build.rig.addPostTypescriptTask(copyVueFiles);

// Ref: http://blog.aterentiev.com/2018/05/using-vuejs-in-sharepoint-framework.html
// marker to check if custom watch is already registered
// used to prevent watch bubbling
let customWatchRegistered = false;

let watchVueFiles = build.subTask('watch-vue-files', function (gulp, buildOptions, done) {
    // register watch only on first run
    if (!customWatchRegistered) {

        // on change of *.vue files
        gulp.watch('./src/**/*.vue', event => {
            // copy empty index.ts onto itself to launch build procees
            gulp.src('./src/index.ts')
                .pipe(gulp.dest('./src/'));
        });

        // after watch is registered don't register again
        customWatchRegistered = true;

    }

    done();
});

build.rig.addPreBuildTask(watchVueFiles);

// Merge custom loader to web pack configuration
build.configureWebpack.mergeConfig({

    additionalConfiguration: (generatedConfiguration) => {
        const path = require('path');
        const VueLoaderPlugin = require('vue-loader/lib/plugin');
        const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');

        const vuePlugin = new VueLoaderPlugin();
        const forkTsPlugin = new ForkTsCheckerWebpackPlugin({
            vue: true,
            tslint: true,
            formatter: 'codeframe',
            checkSyntacticErrors: false
        });

        const loadersConfigs = [{
            test: /\.vue$/, // vue
            use: [{
                loader: 'vue-loader'
            }]
        }, {
            resourceQuery: /vue&type=script&lang=ts/, // typescript
            loader: 'ts-loader',
            options: {
                appendTsSuffixTo: [/\.vue$/],
                transpileOnly: true
            }
        }, {
            resourceQuery: /vue&type=style.*&lang=scss/, // scss
            use: [
                {
                    loader: require.resolve('@microsoft/loader-load-themed-styles'),
                    options: {
                        async: true
                    }
                },
                {
                    loader: 'css-loader',
                    options: {
                        modules: true,
                        localIdentName: '[local]_[sha1:hash:hex:8]'
                    }
                },
                'sass-loader']
        }, {
            resourceQuery: /vue&type=style.*&lang=sass/, // sass
            use: [
                {
                    loader: require.resolve('@microsoft/loader-load-themed-styles'),
                    options: {
                        async: true
                    }
                },
                {
                    loader: 'css-loader',
                    options: {
                        modules: true,
                        localIdentName: '[local]_[sha1:hash:hex:8]'
                    }
                },
                'sass-loader?indentedSyntax']
        }];

        generatedConfiguration.plugins.push(vuePlugin, forkTsPlugin);
        generatedConfiguration.module.rules.push(...loadersConfigs);
        generatedConfiguration.resolve.alias = {
            '~': path.resolve(__dirname, 'lib')
        }

        return generatedConfiguration;

    }
});

build.initialize(gulp);
