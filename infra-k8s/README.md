# インフラ構成(ローカルでのk8s検証)

k8s(Kubernetes)について、複数のコンテナを起動して管理することができる。(コンテナオーケストレーション)

クラウド環境としては下記が利用されることが多い。

- Amazon Web Service(AWS)
- Google Cloud Platform(GCP)
- Microsoft Azure

今回は学習利用としてローカル環境でk8sクラスターを構築する。

※開発目的でローカル環境にクラスターを構築する意味は薄い(コードの修正のたびにDockerイメージのビルドが必要になるため)

## Docker

k8s環境では各アプリケーションをdockerイメージとしてビルドして、マニュフェストファイルで指定することでコンテナとして立ち上げる。

- BFFアプリケーション：`../bff/Dockerfile`
- バックエンドアプリケーション：`../catalogue/Dockerfile`
- フロントエンドアプリケーション：`../frontend/Dockerfile`

### イメージビルドのベストプラクティス

#### マルチステージビルド

```
FROM golang:1.19-alpine AS builder
↑ステージ名をASで指定する。
ここからの記述でGoアプリケーションのビルドを実行する。
※ビルドに利用したalpineイメージは最終のビルドイメージには含まない

FROM gcr.io/distroless/static-debian11:nonroot
↑Googleが提供するdistrolessイメージにビルドの成果物を配置する。
distrolessイメージはシェルを含まないなど、最小限のランタイム環境を提供するためイメージの最小化とセキュリティ担保に有効
※イメージによっては元々サイズが小さい、nginxなどミドルウェアが提供されないなど利用が必須ではない場合もある
```

#### 不要なパッケージのインストール禁止

複雑な依存関係の排除、イメージサイズやビルド時間の削減のため、必須ではないパッケージはインストールすべきではない。

※shellを入れる、vimやjqを入れるなど

#### 軽量なベースイメージを使う

scratch,distroless,alpineなどの軽量、かつ不要なパッケージを極力排除したベースイメージを利用することでイメージサイズやビルド時間を削減できる。

#### セキュア化(不要な特権を避ける)

コンテナはデフォルトでrootで実行されるが、rootでの実行は避けるべき。

※コンテナ内のrootはホストマシン上のrootで実行される可能性があり、privileged モードなどホストのリソースにアクセス可能な状況でホストを乗っ取られる可能性があるため

#### 信頼できるベースイメージを利用する

信頼性の低い、もしくは長期間メンテナンスされていないイメージをベースイメージとして利用するのは脆弱性の混入リスクがあるため避ける。

#### Dockerfileの命令にシークレットや認証情報を入れない

DB接続情報など、ビルド時にイメージに持たせると情報流出の可能性があるため、このような情報はコンテナの外部から受け渡すようにする。

※ARGやENVなどで秘匿情報をハードコーディングしない、イメージ自体に秘匿情報を持つような作りにしない

k8sでもSecretリソースなどを適切に設定することでコンテナの起動時にファイルや環境変数として秘匿情報を渡すことができる。

## Dockerレジストリ

DockerレジストリとしてGitHub Container Registryを利用する。

イメージはGitHub Container Registryに対応する形で命名する必要がある。

イメージのビルド

```
$ docker build -t ghcr.io/<your-username>/<image-name>:<tag> .
$ docker build -t ghcr.io/tigaweb/bff:0.1 bff/
$ docker build -t ghcr.io/tigaweb/catalogue:0.1 catalogue/
$ docker build -t ghcr.io/tigaweb/frontend:0.1 frontend/
```

イメージのプッシュ
```
$ docker push ghcr.io/tigaweb/bff:0.1
$ docker push ghcr.io/tigaweb/catalogue:0.1
$ docker push ghcr.io/tigaweb/frontend:0.1
```

## kind

kindは`Kubernetes in Docker`の略で、Dockerコンテナノードを使ってローカル上でKubernetesを実行するツール。

※ローカルのDockerコンテナとしてk8sのクラスターを立ち上げられるということ

※他にminikubeなどのツールもあるが、kindの方がシステムリソース(CPU,メモリ)の消費量が少ない傾向にあると言われている。

### ツールのインストール

```
$ brew install kind
$ kind --version
kind version 0.23.0

クラスターの作成
$ kind create cluster
$ kind get clusters
kind
```

### マニュフェスト

下記に記載

- `./bff/k8s/bff.yml`
- `./catalogue/k8s/catalogue.yaml`
- `./frontend/k8s/frontend.yaml`

### デプロイ

```
$ cd infra-k8s
$ kubectl apply -f ./bff/k8s/bff.yml
$ kubectl apply -f ./catalogue/k8s/catalogue.yaml
$ kubectl apply -f ./frontend/k8s/frontend.yaml

正常に登録できた場合
$ kubectl get pod -n default                     
NAME                         READY   STATUS    RESTARTS   AGE
bff-7f6969c57d-zp7vs         1/1     Running   0          17m
calalogue-664cd8b5df-5d7hw   1/1     Running   0          15s
frontend-87776449-zvdhb      1/1     Running   0          4s
```
