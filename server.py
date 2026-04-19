import threading
import socket
import sys
PORT = 5050
SERVER = "127.0.0.1"
ADDR = (SERVER, PORT)
FORMAT = "utf-8"
DISCONNECT_MESSAGE = "!DISCONNECT"
clientKey=0
server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
server.bind(ADDR)

clients = dict()
clients_lock = threading.Lock()
bad_words=('butt','butthole','jerk','idiot','moron','damn')
client_offense=dict()

def censor(msg):
    for w in bad_words:
        if msg.lower().find(w) != -1:
            return True
    return False

def handle_client(conn, addr):
    try:
        connected = True
        while connected:
            msg = conn.recv(1024).decode(FORMAT)
            if not msg:
                break


            if msg[msg.index("-->")+4:] == DISCONNECT_MESSAGE:
                connected = False
            sys.stdout.flush()
            user=msg[0:msg.index("-->")]
            user1=msg[2:msg.index(",")-1]
            user2=msg[msg.index(",")+2:msg.index(")")]

            with clients_lock:
                if censor(msg):
                    client_offense[addr]+=1
                    if client_offense[addr]==1:
                        clients[addr].send("Administrator: Please refrain from offensive language.")
                    else:
                        if client_offense[addr]==2:
                            clients[addr].send("Administrator: I'm warning you...")
                        else:
                            if client_offense[addr]==3:
                                clients[addr].send("Administrator: OK, You're outa here.\nDisconnected.")
                                break
                    continue
            with clients_lock:
                #sys.stdout.write(str(clients.keys()))
                #sys.stdout.flush()
                for c in clients.keys():
                    sys.stdout.flush()
                    if str(c[0]) == user1 and str(c[1])==user2:
                       continue;
                    clients[c].send(msg.encode(FORMAT))
    finally:
        with clients_lock:
            clients.pop(addr)
            sys.stdout.write("\nClient count is : " + str(threading.active_count()-1))
        conn.close()


def start():
    global clientKey
    print('SERVER STARTED')
    sys.stdout.flush()
    server.listen(5)
    while True:
        sys.stdout.flush()
        conn, addr = server.accept()
        #print(conn.getsockname())
        #print(addr)
        sys.stdout.flush()
        with clients_lock:
            clients[addr]=conn
            client_offense[addr]=0
            #clientKey+=1
            #sys.stdout.write(str(clients.keys())+'\n')
        thread = threading.Thread(target=handle_client, args=(conn, addr))
        thread.start()
        print("\nClient count is : " + str(threading.active_count()-1))
start()
