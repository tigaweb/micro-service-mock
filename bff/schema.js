export const typeDefs = `#graphql

# "Book"型の定義
type Book {
  id: Int
  title: String
  author: String
  price: Int
}

# クエリの定義
type Query {
  book(id: Int): Book
  books: [Book]
}
`;
