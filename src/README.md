Comet server
============

## Установка

сначала поставить зависимости:

```bash
sudo apt-get install libcairo2-dev libjpeg8-dev libpango1.0-dev libgif-dev build-essential g++
```

потом модули:

```bash
npm install
```

потом shared модули:

```bash
cd ..
npm install
```

## Конфигурация

создать в папке configs один (или несколько) конфиг файл:

```
default.conf
environment.conf
machine.conf
user.conf
```

каждый следующий перезаписывает значения предыдущего. в гит попадает только default.conf, в котором не должна находиться важная информация (юзернеймы, пароли и тд)

## Запуск

```bash
node server
```

Vagrant
=======

Запуск и настройка окружения в связке с проектом backend описаны в комментариях в файле Vagrantfile 
