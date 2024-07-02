const express = require('express');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const app = express();
const port = 3005;
dotenv.config();

const { Pool } = require('pg');
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'myeconomydb',
    password: 'admin',
    port: 5432
});

app.use(express.json());

if (!process.env.TOKEN_SECRET) {
    console.error('Falta a chave secreta para o TOKEN JWT!');
    process.exit(1);
}

function generateAccessToken(email) {
    const payload = { email };
    return jwt.sign(payload, process.env.TOKEN_SECRET, { expiresIn: '21600s' });
}

async function validateToken(req, res, next) {
    const { authorization } = req.headers;
    if (!authorization) {
        return res.sendStatus(403);
    }

    const token = authorization.replace('Bearer ', '');
    try {
        const decoded = jwt.verify(token, process.env.TOKEN_SECRET);
        const userId = await getUserIdFromToken(decoded.email);
        if (userId) {
            req.user = { email: decoded.email, id: userId };
            next();
        } else {
            res.sendStatus(403);
        }
    } catch (error) {
        res.sendStatus(403);
    }
}

async function getUserIdFromToken(email) {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT id FROM users WHERE email = $1', [email]);
        client.release();
        if (result.rows.length > 0) {
            return result.rows[0].id;
        }
        return null;
    } catch (error) {
        console.error('Erro ao extrair id do usuário', error);
        return null;
    }
}

const today = new Date();
const month = today.getMonth() + 1;
console.log('Mês atual:', month);

async function checkMonth(id) {
    //Extrai o valor do mes contido na coluna reference_month para comparar com o mes atual
    try {
        const client = await pool.connect();
        const expenseMonthResult = await client.query(
            'SELECT EXTRACT (MONTH FROM reference_month) AS month FROM expenses WHERE id = $1',
            [id]
        );
        client.release();
        if (expenseMonthResult.rows.length > 0) {
            const expenseMonth = expenseMonthResult.rows[0].month;
            return expenseMonth < month;
        }
        return false;
    } catch (error) {
        console.error('Erro na funçao checkMonth', error);
        return false;
    }
}

async function checkMonthLimit(id) {
    try {
        const client = await pool.connect();
        const limitMonthResult = await client.query(
            'SELECT EXTRACT (MONTH FROM reference_month) AS month FROM user_limit WHERE id = $1',
            [id]
        );
        client.release();
        if (limitMonthResult.rows.length > 0) {
            const limitMonth = limitMonthResult.rows[0].month;
            return limitMonth < month;
        }
        return false;
    } catch (error) {
        console.error('Erro ao checar mês do Limite', error);
        return false;
    }
}

// ------ENDPOINTS USUARIO------

app.post('/signup', async (req, res) => {
    const { name, email, password, birthdate } = req.body;
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    try {
        const client = await pool.connect();
        const userExists = await client.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userExists.rows.length > 0) {
            client.release();
            return res.status(400).send('Usuário já existe!');
        } else {
            const newUser = await client.query(
                'INSERT INTO users (name, email, password, birthdate) VALUES ($1, $2, $3, $4) RETURNING *',
                [name, email, hashedPassword, birthdate]
            );
            client.release();
            res.status(201).json({ message: 'Usuário cadastrado com sucesso!', user: newUser.rows[0] });
        }
    } catch (error) {
        console.error('Erro ao cadastrar usuário: ', error);
        res.status(500).json({ error: 'Erro ao cadastrar usuário!' });
    }
});

app.post('/signin', async (req, res) => {
    const { email, password } = req.body;

    try {
        const client = await pool.connect();
        const userExists = await client.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userExists.rows.length > 0) {
            const user = userExists.rows[0];
            const isMatch = await bcrypt.compare(password, user.password);
            if (isMatch) {
                const token = generateAccessToken(email);
                client.release();
                return res.status(200).json({ token });
            } else {
                client.release();
                return res.status(400).send('Senha incorreta!')
            }
        } else {
            client.release();
            return res.status(400).send('Usuário não encontrado!')
        }
    } catch (error) {
        console.error('Erro ao realizar login: ', error);
        res.status(500).send('Erro ao realizar login!');
    }
});

app.get('/user', validateToken, async (req, res) => {
    const userId = req.user.id;

    try {
        const client = await pool.connect();
        const read = await client.query(
            'SELECT * FROM users WHERE id = $1',
            [userId]
        );
        client.release();
        res.status(200).json({ users: read.rows });
    } catch (error) {
        console.error('Erro ao listar usuários', error);
        res.status(500).send('Erro ao listar usuários!');
    }
});

// ------ENDPOINTS DESPESAS------

app.get('/categories', async (req, res) => {
    try {
        const client = await pool.connect();
        const categories = await client.query(
            'SELECT * FROM categories'
        );
        client.release();
        res.status(200).json({ categories: categories.rows });
    } catch (error) {
        console.error('Erro ao listar categorias', error);
        res.status(500).send('Erro ao listar categorias!');
    }
});

app.get('/expense/mes/:month', validateToken, async (req, res) => {
    const userId = req.user.id;
    const { month } = req.params;

    // Validar o formato do mês
    if (!/^\d{2}-\d{2}-\d{4}$/.test(month)) {
        return res.status(400).send('Formato do mês inválido. Use o formato DD-MM-YYYY.');
    }

    // Extrair o mês e ano do parâmetro
    const [day, monthPart, year] = month.split('-');
    const formattedMonth = `${year}-${monthPart}`;

    try {
        const client = await pool.connect();
        const read = await client.query(
            `SELECT * FROM expenses WHERE user_id = $1 AND TO_CHAR(reference_month, 'YYYY-MM') = $2`,
            [userId, formattedMonth]
        );
        client.release();
        if (read.rows.length > 0) {
            res.status(200).json({ limits: read.rows });
        } else {
            res.status(404).send('Nenhuma despesa encontrada para o mês especificado.');
        }
    } catch (error) {
        res.status(500).send('Erro ao buscar despesas');
        console.error('Erro ao buscar despesas', error);
    }
});

app.post('/expense/create', validateToken, async (req, res) => {
    const { description, amount, reference_month, category_id } = req.body;
    const userId = req.user.id;

    // Pega o índice 3 e 4 da data para comparar com o mês atual
    const index1 = reference_month.charAt(3);
    const index2 = reference_month.charAt(4);
    const expenseMonth = index1 + index2;

    if (expenseMonth < month) {
        res.status(400).send('Não é possível inserir uma despesa em um mês anterior ao atual!');
    } else {
        try {
            const client = await pool.connect();
            await client.query('SET datestyle = "DMY"');
            const newExpense = await client.query(
                'INSERT INTO expenses (description, amount, reference_month, user_id, category_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
                [description, amount, reference_month, userId, category_id]
            );
            client.release();
            res.status(200).json({ message: 'Despesa cadastrada com sucesso!', expense: newExpense.rows[0] });
        } catch (error) {
            console.error('Erro ao cadastrar despesa', error);
            res.status(500).send('Erro ao cadastrar despesa!');
        }
    }
});

app.delete('/expense/delete/:id', validateToken, async (req, res) => {
    const expenseId = req.params.id;

    try {
        const client = await pool.connect();
        const expense = await client.query('SELECT reference_month FROM expenses WHERE id = $1', [expenseId]);
        client.release();

        const reference_month = expense.rows[0].reference_month;
        const index1 = reference_month.charAt(3);
        const index2 = reference_month.charAt(4);
        const expenseMonth = index1 + index2;

        if (expenseMonth < month) {
            res.status(400).send('Não é possível excluir uma despesa de um mês anterior ao atual!');
        } else {
            const deleteExpense = await client.query('DELETE FROM expenses WHERE id = $1', [expenseId]);
            client.release();
            res.status(200).json({ message: 'Despesa excluída com sucesso!' });
        }
    } catch (error) {
        console.error('Erro ao excluir despesa: ', error);
        res.status(500).send('Erro ao excluir despesa!');
    }
});

// ------ENDPOINTS LIMITES------

app.get('/limits', validateToken, async (req, res) => {
    const userId = req.user.id;

    try {
        const client = await pool.connect();
        const limits = await client.query(
            'SELECT * FROM user_limit WHERE user_id = $1',
            [userId]
        );
        client.release();
        res.status(200).json({ limits: limits.rows });
    } catch (error) {
        console.error('Erro ao listar limites', error);
        res.status(500).send('Erro ao listar limites!');
    }
});

app.post('/limit/create', validateToken, async (req, res) => {
    const { amount, reference_month, category_id } = req.body;
    const userId = req.user.id;

    const index1 = reference_month.charAt(3);
    const index2 = reference_month.charAt(4);
    const limitMonth = index1 + index2;

    if (limitMonth < month) {
        res.status(400).send('Não é possível inserir um limite em um mês anterior ao atual!');
    } else {
        try {
            const client = await pool.connect();
            await client.query('SET datestyle = "DMY"');
            const newLimit = await client.query(
                'INSERT INTO user_limit (amount, reference_month, user_id, category_id) VALUES ($1, $2, $3, $4) RETURNING *',
                [amount, reference_month, userId, category_id]
            );
            client.release();
            res.status(201).json({ message: 'Limite cadastrado com sucesso!', limit: newLimit.rows[0] });
        } catch (error) {
            console.error('Erro ao cadastrar limite: ', error);
            res.status(500).send('Erro ao cadastrar limite!');
        }
    }
});

app.delete('/limit/delete/:id', validateToken, async (req, res) => {
    const limitId = req.params.id;

    try {
        const isLimitInPastMonth = await checkMonthLimit(limitId);

        if (isLimitInPastMonth) {
            res.status(400).send('Não é possível excluir um limite de um mês anterior ao atual!');
        } else {
            const client = await pool.connect();
            const deleteLimit = await client.query('DELETE FROM user_limit WHERE id = $1', [limitId]);
            client.release();
            res.status(200).json({ message: 'Limite excluído com sucesso!' });
        }
    } catch (error) {
        console.error('Erro ao excluir limite: ', error);
        res.status(500).send('Erro ao excluir limite!');
    }
});

app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
});