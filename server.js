const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

/* ========================= */
/* CONFIG */

const ROOM_LIMITS = {
  "sala-geral": 16,
  "sala-events": 10,
  "sala-duo": 2,
  "sala-duo2": 2,
  "sala-squad": 4,
  "sala-squad2": 4
};

/* ========================= */
/* MEMÓRIA */

const activeUsers = new Map();

/*

user.id -> {

 socketId,
 room,
 user

}

*/

const privateMutes = new Map();

/* ========================= */

function pairKey(a,b){

 return [a,b].sort().join("-");

}

/* ========================= */

function emitRoomCount(room){

 const roomSet=
 io.sockets.adapter.rooms.get(room);

 const count=
 roomSet ? roomSet.size : 0;

 io.to(room).emit("room-count",{

   room,

   count,

   limit:
   ROOM_LIMITS[room] || 16

 });

}

/* ========================= */

function emitRoomUsers(room){

 const users=

 Array.from(

 io.sockets.adapter.rooms.get(room)

 || []

 )

 .map(id=>{

   const s=
   io.sockets.sockets.get(id);

   return{

     id,

     user:s?.user

   };

 })

 .filter(x=>x.user);

 io.to(room)

 .emit(

  "room-users",

  users

 );

}

/* ========================= */

function removeAllMutes(userId){

 for(

 const [key,data]

 of privateMutes

 ){

   if(

    data.userA===userId ||

    data.userB===userId

   ){

    privateMutes.delete(key);

   }

 }

}

/* ========================= */

io.on(

"connection",

socket=>{

 console.log(

 "Conectou:",

 socket.id

 );

 /* ========================= */
 /* JOIN */

 socket.on(

 "join-room",

 ({room,user})=>{

  if(

   !room ||

   !user ||

   !user.id

  ){

   return;

  }

  const limit=

  ROOM_LIMITS[room]

  || 16;

  /* remove login duplicado */

  if(

   activeUsers.has(

   user.id

   )

  ){

   const old=

   activeUsers.get(

   user.id

   );

   const oldSocket=

   io.sockets.sockets.get(

   old.socketId

   );

   if(oldSocket){

    oldSocket.disconnect(true);

   }

  }

  const roomSet=

  io.sockets.adapter.rooms

  .get(room);

  const roomSize=

  roomSet ?

  roomSet.size : 0;

  if(

   roomSize >= limit

  ){

   socket.emit(

   "room-full",

   {

    room,

    limit,

    current:

    roomSize

   }

   );

   return;

  }

  socket.join(room);

  socket.room=room;

  socket.user=user;

  activeUsers.set(

  user.id,

  {

   socketId:

   socket.id,

   room,

   user

  }

  );

  socket.to(room)

  .emit(

  "user-joined",

  {

   id:socket.id,

   user

  }

  );

  emitRoomUsers(room);

  emitRoomCount(room);

 });

 /* ========================= */
 /* SIGNAL */

 socket.on(

 "signal",

 data=>{

  io.to(

  data.to

  )

  .emit(

  "signal",

  {

   from:

   socket.id,

   signal:

   data.signal

  }

  );

 });

 /* ========================= */
 /* MUTE PRIVADO */

 socket.on(

 "toggle-mute-user",

 ({targetId})=>{

  if(

   !socket.user

  ){

   return;

  }

  const ownerId=

  socket.user.id;

  const key=

  pairKey(

  ownerId,

  targetId

  );

  const mute=

  privateMutes.get(

  key

  );

  if(

   mute &&

   mute.ownerId===ownerId

  ){

   privateMutes.delete(

   key

   );

   const target=

   activeUsers.get(

   targetId

   );

   if(target){

    io.to(

    socket.id

    )

    .emit(

    "user-unmuted",

    {

     targetId

    }

    );

    io.to(

    target.socketId

    )

    .emit(

    "user-unmuted",

    {

     targetId:

     ownerId

    }

    );

   }

   return;

  }

  const target=

  activeUsers.get(

  targetId

  );

  if(!target){

   return;

  }

  privateMutes.set(

  key,

  {

   ownerId,

   userA:

   ownerId,

   userB:

   targetId

  }

  );

  io.to(

  socket.id

  )

  .emit(

  "user-muted",

  {

   targetId

  }

  );

  io.to(

  target.socketId

  )

  .emit(

  "user-muted",

  {

   targetId:

   ownerId

  }

  );

 });

 /* ========================= */
 /* DISCONNECT */

 socket.on(

 "disconnect",

 ()=>{

  if(

   socket.user

  ){

   activeUsers.delete(

   socket.user.id

   );

   removeAllMutes(

   socket.user.id

   );

  }

  if(

   socket.room

  ){

   socket.to(

   socket.room

   )

   .emit(

   "user-left",

   socket.id

   );

   emitRoomUsers(

   socket.room

   );

   emitRoomCount(

   socket.room

   );

  }

  console.log(

  "Saiu:",

  socket.id

  );

 });

}

);

const PORT=

process.env.PORT

|| 3000;

server.listen(

PORT,

()=>{

 console.log(

 "Servidor online"

 );

}

);