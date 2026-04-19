import socket
import time
import sys
import threading

PORT = 5050
SERVER = "127.0.0.1"
ADDR = (SERVER, PORT)
FORMAT = "utf-8"
DISCONNECT_MESSAGE = "!DISCONNECT"


def connect():
    client = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    client.connect(ADDR)
    return client


def send(client, msg):
    message = str(client.getsockname()) +"--> "+ msg
    client.send(message.encode(FORMAT))

def receive(client, addr):
    while True:
        msg = client.recv(1024)
        if not msg:
            break
        sys.stdout.write(msg.decode(FORMAT) + '\n' )
        sys.stdout.flush()

def start():
    sys.stdout.flush()
    sys.stdout.write("connect ? (y/n)\n")
    sys.stdout.flush()
    answer = raw_input()
    sys.stdout.flush()
    if answer.lower() != 'y':
        return

    connection = connect()
    print(str(connection.getsockname()) + " is connected and ready.")
    sys.stdout.flush()
    thread = threading.Thread(target=receive, args=(connection, ADDR))
    thread.start()
    while True:
        #sys.stdout.write("\n>")
        sys.stdout.flush()
        msg = raw_input()
        #sys.stdout.write(">")
        sys.stdout.flush()
        if msg == 'q':
            break
        send(connection, msg)

    send(connection, DISCONNECT_MESSAGE)
    time.sleep(1)
    print('Disconnected')

#raw_input()

start()
