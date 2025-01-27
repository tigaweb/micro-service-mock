# Book Shopアプリケーション

書籍「クラウドネイティブで実現する マイクロサービス開発・運用実践」提供のハンズオンの学習用リポジトリ

## サービス構成

| サービス/コンポーネント   | 概要                                                                            |
| ------------------------- | ------------------------------------------------------------------------------- |
| カタログサービス          | 書籍のタイトル、著者名、値段など書籍情報を管理                                  |
| 注文サービス              | 注文の受付、注文履歴情報など、注文情報を管理                                    |
| 発送サービス              | 注文受付時に発送情報を管理                                                      |
| BFF(Backend for Frontend) | カタログサービス、注文サービスの2つのバックエンドと、フロントエンドの通信を集約 |
| フロントエンド            | ユーザインターフェースを構築                                                    |
| メッセージブローカー      | イベント駆動型通信におけるメッセージ送受信を管理                                |
| 認証サーバ                | ユーザーの認証情報を管理                                                        |

## 各コンポーネント(マイクロサービスの通信イメージ)

フロントエンド
=GraphQL=> BFF(バックエンドフォアフロントエンド)
==gRPC==> 注文 -> メッセージブローカー -> 発送
==gRPC==> カタログ
==> 認証サーバ

マイクロサービスはk8s(Kubernetes)上のPodにデプロイされる

## 環境構築

MacOSを前提

Goのインストール

```
$ brew install go
$ go version
go version go1.20.2 darwin/arm64
```

Protocol Buffersのインストール(gRPC)

```
$ brew install protbuf
$ protoc --version
libprotoc 3.21.12
```

kindのインストール

```
$ brew install kind
$ kind --version
kind version 0.23.0
```

istioのインストール

```
$ curl -L https://istio.io/downloadIstio | sh -
$ cd istio-1.24.2
$ echo 'export PATH="'$PWD'/bin:$PATH"' >> ~/.zshrc
$ source ~/.zshrc
$ istioctl version
Istio is not present in the cluster: no running Istio pods in namespace "istio-system"
client version: 1.24.2
```

grpcurlのインストール

```
$ brew install grpcurl
```

## アプリケーションの実装

`./catalogue/`

### gRPCの概要

リモートプロセス上でメソッド呼び出しを行う。RPCフレームワークの一つとしてgRPCがある。

従来のリクエスト/レスポンス方の通信の場合、実装が素直なメリットがあるが、レスポンスを待つ間に処理がブロッキングされてしまうデメリットがある。

gRPCのようなイベント駆動型の通信ではあるマイクロサービスが発行したイベントを、別のマイクロサービスが利用する形式のためリクエスト/レスポンス型のような待ち時間が発生しないメリットがある。ただし、実装・通信面においてやや複雑になるデメリットがある。

gRPCはRPCの一種で、通信時に受け渡すデータの構造や型などを記述したインターフェース定義が必要になる。

gRPCは通信におけるクライアントとサーバの間のインターフェースを定義するために`Protocol Buffers`を使っている。

`Protocol Buffers`は構造化データをバイナリ形式にシリアライズすることもでき、gRPCの通信はバイナリ形式にシリアライズされるためJSONやXMLに比べて非常に小さいサイズでの通信が可能となる。

### コードの記述

#### protocコマンドによるコンパイル

protocコマンドを使うことで、`.proto`と同じディレクトリにデータアクセスクラスが作成される。

- catalogue.pb.go
- catalogue_grpc.pb.go

```
% ls -1
catalogue.proto
% protoc --go_out=. --go_opt=paths=source_relative \
--go-grpc_out=. --go-grpc_opt=paths=source_relative \
catalogue.proto
% ls -1
catalogue.pb.go
catalogue.proto
catalogue_grpc.pb.go
```

### Goの記述

#### 初期化・ツールのインストール

```
% go mod init gihyo/catalogue
% go get google.golang.org/grpc
```

#### main.goの記載

protoファイルで定義したGetBookメソッドを実装する

※リクエストで定義したIDに応じて書籍情報を取得し、レスポンス用のデータを作成して返却するもの

リフレクションを設定することにより、クライアントからgrpcurlなどでサーバーメタデータ※を取得できるようにする

- サーバーが提供するサービス名。
- サービス内のRPCメソッド名。
- 各メソッドが受け取るリクエストメッセージやレスポンスメッセージの構造

※リフレクションを有効にするとサーバーのメタデータが公開されるため、本番環境では無効にする

※grpcurlはcurlのように平文で送信できるため、テストやデバッグで利用する

### サーバーの起動

```
% go run main.go
2025/01/12 17:34:19 server listening at [::]:50051
```

#### grpcurlによる動作確認

リフレクションからサービスの確認

```
サービスの確認
$ grpcurl -plaintext localhost:50051 list
book.Catalogue
grpc.reflection.v1.ServerReflection
grpc.reflection.v1alpha.ServerReflection

サービスに登録されているメソッドの確認
$ grpcurl -plaintext localhost:50051 list book.Catalogue
book.Catalogue.GetBook
```

データの取得

```
$ grpcurl -plaintext -d '{"id": 1}' localhost:50051 book.Catalogue.GetBook
{
  "book": {
    "id": 1,
    "title": "The Awakeing",
    "author": "Kate Chopin",
    "price": 1000
  }
}
```

## BFFの実装

### BFF(バックエンドフォアフロントエンド)について

複数のマイクロサービスの通信を集約するために利用されるアーキテクチャ。

HTTPのインターフェースからユーザーの入力を受け付け、データの取得・更新を行うアプリケーションの機能をバックエンド・フロントエンドとして役割を分担し、独立して開発を行えるようにしたもの。

BFFが必要になった背景としてクライアント端末の種類の増加とそれに伴うロジックの増加がある。

例えばスマホアプリ・デスクトップアプリ・Webアプリでメッセージやコンテンツの出しわけを実装しようとすると、フロントエンド側のコードが複雑・冗長になる問題があった。

そのため、フロントエンドとしての役割をBFFとして切り出すことでバックエンドとフロントエンドが干渉せずに独立して開発できるようになった。

### BFFの実装に持ちいるGraphQL

GraphQLはAPI用のクエリ言語とサーバサイドのランタイム。

GraphQLではクライアントが必要なデータのみをリクエストし、サーバがそれに応じてデータを返す。

サーバ側を変更せずにクライアント側で必要な情報を柔軟に決定できるため、BFFの実装方法として有力な選択肢となる。

### GraphQLを用いたBFF

#### Apollo Serverを使ったBFFの実装

```
$ npm init --yes
$ npm install @apollo/server express graphql cors body-parser
```

| ライブラリ     | 概要                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------- |
| graphql        | GraphQLを解析および実行するライブラリ                                                     |
| @apollo/server | Apollo Serverのメインライブラリ。主にHTTPリクエストを/レスポンスをGraphQL操作に変換する。 |
| express        | Node.js用のWebフレームワーク                                                              |
| cors           | Express上でCORSを利用するライブラリ                                                       |
| body-parser    | Express上でHTTP本文を解析するライブラリ                                                   |

#### GraphQLスキーマを定義

`./bff/schema.js`

クライアントが問い合わせるためのデータ構造として、GraphQLスキーマを定義する。

引数で指定したIDの書籍情報を返すクエリを定義。

#### クエリに対して応答するモックの実装

`./bff/resolver.js`

リゾルバではスキーマに対してクエリなどのデータ操作を定義する。

リゾルバは特定のタイプに関連付けられたデータを取得する方法をApollo Serverに指示する。

#### バックエンドからのデータの取得

`./bff/proto/catalogue.proto`

バックエンド側の`./catalogue/proto/book/catalogue.proto`と同様の内容のprotoファイルを配置する。

※gRPC通信するためのインターフェース定義なのでクライアント側のBFFとサーバ側のバックエンドが同じprotoファイルを共有する必要がある。

`./bff/datasource/catalogue.js`

BFFからバックエンドに通信を行うためcatalogue.jsを実装する。

これにより、フロントエンドからバックエンドに直接接続するのではなく、BFFを経由してバックエンドに通信する仕組みができる。

フロントエンドはgRPCを意識せずに開発を進める、フロントエンド・バックエンドの要件や仕様の違いを吸収することができる。

### シングルページアプリケーションの実装

ReactからGraphQLでBFFに疎通、BFFからgRPCでバックエンドに疎通する構成にする。

※サーバサイドの実装を主とするため、本コードの実装は最低限 

### インフラ構成(ローカルKubernetes)

[こちら](./infra-k8s/README.md)に記載
