CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;
 
create table users(
    id UUID primary key default uuid_generate_v4(),
    name varchar(100) not null,
    email varchar(100) not null,
    password varchar(100) not null,
    birthdate date not null
);
 
CREATE TABLE expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    description TEXT NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    reference_month DATE NOT NULL,
    user_id UUID,
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id)
);
 
CREATE TABLE user_limit (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    reference_month DATE NOT NULL,
    limit_amount NUMERIC(10,2) NOT NULL,
    CONSTRAINT fk_user_limit FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE (user_id, reference_month)
);

CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL
);

ALTER TABLE expenses
ADD COLUMN category_id UUID,
ADD CONSTRAINT fk_category FOREIGN KEY (category_id) REFERENCES categories(id);


INSERT INTO categories (id, name)
VALUES 
    (uuid_generate_v4(), 'refeição'),
    (uuid_generate_v4(), 'alimentos'),
    (uuid_generate_v4(), 'transporte'),
    (uuid_generate_v4(), 'lazer'),
    (uuid_generate_v4(), 'despesas'),
    (uuid_generate_v4(), 'vestuário');

 
select * from users;
select * from expenses;
select * from user_limit;

drop table user;
drop table expenses;
drop table user_limit;